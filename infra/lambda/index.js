const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const axios = require("axios");
const natural = require("natural");
const tokenizer = new natural.WordTokenizer();

// Configuración inicial
const dynamoClient = new DynamoDBClient({ region: "eu-south-2" });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({ region: "eu-south-2" });

const TABLE_NAME = process.env.TABLE_NAME || "Challenges";
const PRIMARY_KEY = process.env.PRIMARY_KEY || "pk";
const SORT_KEY = process.env.SORT_KEY || "sk";
const THEME_ATTR = process.env.THEME_ATTR || "themeAttr";
const LEVEL_ATTR = process.env.LEVEL_ATTR || "levelAttr";
const MAX_ATTEMPTS = process.env.MAX_RETRIES
  ? parseInt(process.env.MAX_RETRIES)
  : 3;
const SIMILARITY_THRESHOLD = process.env.SIMILARITY_THRESHOLD
  ? parseFloat(process.env.SIMILARITY_THRESHOLD)
  : 0.5;

// Cache para el secreto
let openRouterApiKey;

async function getApiKey() {
  if (!openRouterApiKey) {
    try {
      const response = await secretsClient.send(
        new GetSecretValueCommand({
          SecretId: process.env.OPENROUTER_SECRET_ARN,
        })
      );
      openRouterApiKey = response.SecretString;
    } catch (error) {
      console.error("Error al obtener API key:", error);
      throw new Error("Error de configuración: No se pudo obtener la API key");
    }
  }
  return openRouterApiKey;
}

async function generateChallenge(
  theme,
  level,
  attempt = 0,
  previousQuestions = []
) {
  const apiKey = await getApiKey();

  // Construir parte del prompt con preguntas anteriores a evitar
  const avoidQuestions =
    previousQuestions.length > 0
      ? `\n\nPreguntas anteriores sobre este tema (NO repitas estas):\n${previousQuestions
          .map((q, i) => `${i + 1}. ${q.text}`)
          .join("\n")}`
      : "";
      console.log("anteriores:", avoidQuestions);
  const prompt = `Genera exactamente 1 pregunta tipo test única y diferente sobre ${theme} (nivel ${level}).${avoidQuestions}

Formato requerido:
1. Pregunta: ¿...?
A) Opción A
B) Opción B
C) Opción C
D) Opción D
Respuesta correcta: [LETRA]

La pregunta debe ser claramente diferente en contenido y estructura a las preguntas anteriores.`;

  // Aumentamos la creatividad con cada intento
  const temperature = Math.min(0.7 + attempt * 0.15, 1.2);

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat-v3-0324:free",
        messages: [{ role: "user", content: prompt }],
        temperature: temperature,
        top_p: 0.9,
        frequency_penalty: 1.2,
        presence_penalty: 1.0,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            process.env.HTTP_REFERER || "https://tu-sitio-web.com",
          "X-Title": process.env.APP_TITLE || "Challenge Generator",
        },
        timeout: 15000,
      }
    );

    return {
      text:
        response.data.choices[0]?.message?.content?.trim() ||
        "Reto no disponible",
      prompt: prompt,
      attempt: attempt + 1,
    };
  } catch (error) {
    console.error("Error en generateChallenge:", error);
    throw error;
  }
}

async function checkUniqueness(
  theme,
  level,
  newChallenge,
  previousQuestions = []
) {
  try {
    // 1. Buscar en DynamoDB
    const { Items } = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "ThemeLevelIndex",
        KeyConditionExpression: "themeAttr = :theme AND levelAttr = :level",
        ExpressionAttributeValues: {
          ":theme": theme,
          ":level": level,
        },
        Limit: 5, // Solo las más recientes
        ScanIndexForward: false,
      })
    );

    const allPrevious = [...(Items || []), ...previousQuestions];
    if (allPrevious.length === 0) return true;

    // 2. Comparación mejorada
    const newText = newChallenge.text.toLowerCase();

    // a) Comparación exacta de preguntas completas
    const exactMatch = allPrevious.some(
      (item) => item.text.toLowerCase() === newText
    );
    if (exactMatch) return false;

    // b) Comparación de similitud usando Jaccard (mejorada)
    const newTokens = new Set(tokenizer.tokenize(newText));
    const isSimilar = allPrevious.some((item) => {
      const existingTokens = new Set(
        tokenizer.tokenize(item.text.toLowerCase())
      );
      const intersection = [...newTokens].filter((t) =>
        existingTokens.has(t)
      ).length;
      const union = new Set([...newTokens, ...existingTokens]).size;
      const similarity = intersection / union;
      return similarity > SIMILARITY_THRESHOLD;
    });

    return !isSimilar;
  } catch (error) {
    console.error("Error en checkUniqueness:", error);
    return true; // Si hay error, asumimos que es único
  }
}

async function saveChallenge(challenge, theme, level) {
  try {
    const item = {
      [PRIMARY_KEY]: `CHALLENGE#${Date.now()}`,
      [SORT_KEY]: `${theme}#${level}`,
      [THEME_ATTR]: theme,
      [LEVEL_ATTR]: level,
      text: challenge.text,
      prompt: challenge.prompt,
      createdAt: Date.now(),
      expiryTime: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 días de TTL
      source: "openrouter",
      model: "deepseek-chat-v3",
      attempt: challenge.attempt,
      generationDetails: {
        sdkVersion: process.env.AWS_EXECUTION_ENV || "local",
        memorySize: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || "1024",
      },
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ReturnConsumedCapacity: "TOTAL",
    });

    const result = await dynamodb.send(command);
    console.log("Reto guardado exitosamente:", {
      challengeId: item[PRIMARY_KEY],
      consumedCapacity: result.ConsumedCapacity,
    });

    return item;
  } catch (error) {
    console.error("Error al guardar el reto:", {
      error: error.message,
      stack: error.stack,
      challengeData: challenge,
    });
    throw new Error("No se pudo guardar el reto en la base de datos");
  }
}

exports.handler = async (event) => {
  console.log("Evento recibido:", JSON.stringify(event, null, 2));

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Body inválido. Debe ser JSON." }),
    };
  }

  const { tematica: theme, nivel: level } = body;
  if (!theme || !level) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Faltan campos obligatorios: 'tematica' y/o 'nivel'",
      }),
    };
  }

  try {
    // 1. Obtener preguntas anteriores
    const previousQuestions = await dynamodb
      .send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "ThemeLevelIndex",
          KeyConditionExpression: "themeAttr = :theme AND levelAttr = :level",
          ExpressionAttributeValues: {
            ":theme": theme,
            ":level": level,
          },
          Limit: 3, // Solo las 3 más recientes
          ScanIndexForward: false,
        })
      )
      .then((res) => res.Items || []);

    // 2. Generar con reintentos
    let attempt = 0;
    let isUnique = false;
    let generatedChallenge;
    const generatedQuestions = []; // Para evitar duplicados en esta ejecución

    while (!isUnique && attempt < MAX_ATTEMPTS) {
      generatedChallenge = await generateChallenge(theme, level, attempt, [
        ...previousQuestions,
        ...generatedQuestions,
      ]);

      generatedQuestions.push(generatedChallenge);

      isUnique = await checkUniqueness(theme, level, generatedChallenge, [
        ...previousQuestions,
        ...generatedQuestions.slice(0, -1),
      ]);

      attempt++;
    }

    if (!isUnique) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          error: `No se pudo generar un reto único después de ${MAX_ATTEMPTS} intentos`,
          lastAttempt: generatedChallenge.text,
        }),
      };
    }

    await saveChallenge(generatedChallenge, theme, level);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        id: `challenge-${Date.now()}`,
        challenge: generatedChallenge.text,
        theme,
        level,
        attempts: generatedChallenge.attempt,
        model: "deepseek-chat-v3",
      }),
    };
  } catch (error) {
    console.error("Error en el proceso:", error);
    return {
      statusCode: error.response?.status || 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Error al generar el reto",
        detalle: error.message,
        ...(process.env.NODE_ENV === "development" && {
          stack: error.stack,
        }),
      }),
    };
  }
};
