// Configuración
const API_ENDPOINT =
  "https://jyc933k8pc.execute-api.eu-south-2.amazonaws.com/prod/challenges";

// Referencias DOM
const form = document.getElementById("retoForm");
const loading = document.getElementById("loading");
const result = document.getElementById("result");
const questionContent = document.getElementById("questionContent");
const generateBtn = document.getElementById("generateBtn");

// Manejar envío del formulario
form.addEventListener("submit", async function (e) {
  e.preventDefault();

  // Mostrar loading
  loading.style.display = "block";
  result.style.display = "none";
  generateBtn.disabled = true;
  questionContent.innerHTML = "";

  try {
    // Recopilar datos
    const formData = new FormData(form);
    const payload = {
      tematica: formData.get("tematica"),
      nivel: formData.get("nivel"),
    };

    // Petición a la API
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Verificar respuesta
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Error en el servidor");
    }

    const data = await response.json();

    // Mostrar resultado (formateado)
    showResult(data);
  } catch (error) {
    console.error("Error completo:", error);
    showError(error.message);
  } finally {
    loading.style.display = "none";
    generateBtn.disabled = false;
  }
});

function showResult(data) {
  result.className = "result";
  result.style.display = "block";

  // Formatear la pregunta con HTML
  const formattedQuestion = formatQuestion(data.challenge);
  questionContent.innerHTML = formattedQuestion;
}

function formatQuestion(questionText) {
  // Convertir saltos de línea y destacar respuesta correcta
  return questionText
    .replace(/\n/g, "<br>")
    .replace(/(Respuesta correcta:)/, "<br><br><strong>$1</strong>");
}

function showError(message) {
  result.className = "result error";
  result.style.display = "block";
  questionContent.innerHTML = `
                    <p>❌ <strong>Error:</strong> ${message}</p>
                    <p>Intenta recargar la página o vuelve a intentarlo más tarde.</p>
                `;
}
