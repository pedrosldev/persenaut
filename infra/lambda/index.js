const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const axios = require("axios");

// Configuración inicial
const dynamoClient = new DynamoDBClient({ region: "eu-south-2" });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({ region: "eu-south-2" });

const TABLE_NAME = "Challenges";

// Cache para el secreto
let openRouterApiKey;

async function getApiKey() {
  if (!openRouterApiKey) {
    try {
      const response = await secretsClient.send(
        new GetSecretValueCommand({
          SecretId: process.env.OPENROUTER_SECRET_ARN, // Usamos el ARN directamente
        })
      );
      openRouterApiKey = response.SecretString;
    } catch (error) {
      console.error("Error al obtener API key:", {
        message: error.message,
        stack: error.stack,
        secretArn: process.env.OPENROUTER_SECRET_ARN,
      });
      throw new Error("Error de configuración: No se pudo obtener la API key");
    }
  }
  return openRouterApiKey;
}

exports.handler = async (event) => {
  console.log("Evento recibido:", JSON.stringify(event, null, 2));

  // Validación básica del body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    console.error("Error al parsear el body:", err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Body inválido. Debe ser JSON." }),
    };
  }

  const theme = body.tematica;
  const level = body.nivel;

  if (!theme || !level) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Faltan campos obligatorios: 'tematica' y/o 'nivel'",
      }),
    };
  }

  try {
    // Obtener API key de Secrets Manager
    const apiKey = await getApiKey();

    const prompt = `Genera exactamente 1 pregunta tipo test sobre ${theme} (nivel ${level}). 
    Formato requerido:
    1. Pregunta: ¿...?
    A) Opción A
    B) Opción B
    C) Opción C
    D) Opción D
    Respuesta correcta: [LETRA]
    
    Solo incluye la pregunta con este formato exacto, sin texto adicional.`;

    console.log("Enviando prompt a OpenRouter.ai...");
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat-v3-0324:free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.9,
        top_p: 0.9,
        frequency_penalty: 0.5,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            process.env.HTTP_REFERER || "https://tu-sitio-web.com",
          "X-Title": process.env.APP_TITLE || "Challenge Generator",
        },
        timeout: 10000,
      }
    );

    const challenge =
      response.data.choices[0]?.message?.content?.trim() ||
      "Reto no disponible";
    console.log("Respuesta generada:", challenge);

    // Guardar en DynamoDB
    const challengeId = `challenge-${Date.now()}`;
    await dynamodb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: challengeId,
          theme,
          level,
          challenge,
          createdAt: Date.now(),
          source: "openrouter",
          model: "deepseek-chat-v3",
        },
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        id: challengeId,
        challenge,
        model: "deepseek-chat-v3",
      }),
    };
  } catch (error) {
    console.error("Error en el proceso:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
    });

    return {
      statusCode: error.response?.status || 500,
      body: JSON.stringify({
        error: "Error al generar el reto",
        detalle: error.message,
        ...(process.env.NODE_ENV === "development" && {
          stack: error.stack,
          fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        }),
      }),
    };
  }
};
