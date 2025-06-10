const AWS = require("aws-sdk");
const axios = require("axios");
const ec2 = new AWS.EC2();
const dynamodb = new AWS.DynamoDB.DocumentClient();


const INSTANCE_ID = "i-080aa23d1ecd83299"; // EC2 con Ollama
const TABLE_NAME = "Challenges";


exports.handler = async (event) => {
  const body = JSON.parse(event.body);
  const theme = body.tematica;
  const level = body.nivel


  if (!theme) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Falta temática" }),
    };
  }


  // 1. Arranca EC2 si está parada
  const state = await getInstanceState(INSTANCE_ID);
  if (state !== "running") {
    await ec2.startInstances({ InstanceIds: [INSTANCE_ID] }).promise();
    await waitForRunning(INSTANCE_ID);
  }


  // 2. Llama a Ollama (ajusta el endpoint según tu modelo/infra)
  const response = await axios.post("http://10.0.2.157:11434/api/generate", {
    model: "llama3",
    prompt: `
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
    `,
    stream: false,
  });


  const challenge = response.data.response || "Reto no disponible";


  // 3. Guarda en DynamoDB
  const challengeId = `challenge-${Date.now()}`;
  await dynamodb
    .put({
      TableName: TABLE_NAME,
      Item: { id: challengeId, theme, challenge, createdAt: Date.now() },
    })
    .promise();


  // 4. Responde al frontend
  return {
    statusCode: 200,
    body: JSON.stringify({ id: challengeId, challenge }),
  };
};


async function getInstanceState(instanceId) {
  const res = await ec2
    .describeInstances({ InstanceIds: [instanceId] })
    .promise();
  return res.Reservations[0].Instances[0].State.Name;
}


async function waitForRunning(instanceId) {
  await ec2.waitFor("instanceRunning", { InstanceIds: [instanceId] }).promise();
}
