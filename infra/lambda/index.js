// Reemplazar AWS SDK v2 con v3
const {
  EC2Client,
  StartInstancesCommand,
  DescribeInstancesCommand,
  waitUntilInstanceRunning,
} = require("@aws-sdk/client-ec2");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const axios = require("axios");

// Configurar clientes de AWS SDK v3
const ec2Client = new EC2Client({ region: "tu-region" }); // Reemplaza "tu-region"
const dynamoClient = new DynamoDBClient({ region: "tu-region" });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const INSTANCE_ID = "i-080aa23d1ecd83299"; // EC2 con Ollama
const TABLE_NAME = "Challenges";

exports.handler = async (event) => {
  console.log("Evento recibido:", JSON.stringify(event));

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
    // 1. Verifica el estado de la instancia
    // const state = await getInstanceState(INSTANCE_ID);
    // console.log(`Estado actual de la instancia EC2: ${state}`);

    // if (state !== "running") {
    //   console.log("La instancia no está corriendo. Iniciando...");
    //   await ec2Client.send(
    //     new StartInstancesCommand({ InstanceIds: [INSTANCE_ID] })
    //   );
    //   await waitForRunning(INSTANCE_ID);
    //   console.log("La instancia está corriendo.");
    // }

    // 2. Llama a Ollama (este código permanece igual)
    const ollamaPrompt = `
      Genera EXACTAMENTE 1 pregunta tipo test sobre ${theme} (nivel ${level}).
      Sigue este formato SIN desviaciones:

      1. Pregunta: ¿...?
      A) Opción A
      B) Opción B
      C) Opción C
      D) Opción D
      Respuesta correcta: [LETRA]

      No incluyas texto adicional, explicaciones ni cambios en el formato.
      Solo la pregunta numerada (1.), 4 opciones (A-D) y la respuesta correcta.
    `;

    console.log("Enviando prompt a Ollama...");
    const response = await axios.post("http://10.0.2.157:11434/api/generate", {
      model: "phi3",
      prompt: ollamaPrompt,
      stream: false,
    });

    const challenge = response.data?.response?.trim() || "Reto no disponible";
    console.log("Respuesta generada por Ollama:", challenge);

    // 3. Guarda el reto en DynamoDB (actualizado para SDK v3)
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
        },
      })
    );

    console.log(`Reto guardado con ID: ${challengeId}`);

    // 4. Devuelve respuesta al frontend
    return {
      statusCode: 200,
      body: JSON.stringify({ id: challengeId, challenge }),
    };
  } catch (error) {
    console.error("Error en el proceso:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error interno del servidor",
        detalle: error.message,
      }),
    };
  }
};

// Funciones auxiliares actualizadas para SDK v3
async function getInstanceState(instanceId) {
  try {
    const res = await ec2Client.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] })
    );
    const state =
      res.Reservations?.[0]?.Instances?.[0]?.State?.Name || "unknown";
    return state;
  } catch (err) {
    console.error("Error al obtener el estado de la instancia:", err);
    throw new Error("No se pudo obtener el estado de la instancia EC2.");
  }
}

async function waitForRunning(instanceId) {
  try {
    console.log("Esperando a que la instancia arranque...");
    await waitUntilInstanceRunning(
      { client: ec2Client, maxWaitTime: 300 }, // 5 minutos máximo
      { InstanceIds: [instanceId] }
    );
  } catch (err) {
    console.error("Error esperando a que la instancia esté corriendo:", err);
    throw new Error(
      "Timeout esperando a que la instancia EC2 esté en ejecución."
    );
  }
}
