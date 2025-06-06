# Persenaut

**Persenaut** es una plataforma de retos dinámicos y personalizados que abarca múltiples disciplinas: programación, ciencias, preparación para selectividad, y mucho más.

La aplicación envía retos diarios o en el rango de fechas que el usuario elija, adaptándose a sus preferencias en cuanto a idioma, disciplina y nivel de dificultad. Su objetivo es fomentar el aprendizaje continuo y el desarrollo de habilidades mediante la práctica constante y motivadora.

---

## Características principales

- Retos personalizados según preferencias del usuario
- Retos de programación y otras áreas de conocimiento
- Integración con IA para generación automática de retos
- Almacenamiento eficiente con DynamoDB
- Arquitectura basada en AWS (S3, Lambda, API Gateway, EC2)
- Frontend estático desplegado en S3 con CI/CD
- Infraestructura como código mediante AWS CDK
- Escalabilidad y seguridad garantizadas mediante buenas prácticas AWS

---

## Estructura del proyecto

- `persenaut-web`: Frontend desarrollado con Astro para una experiencia rápida y dinámica.
- `persenaut-api`: Backend con funciones Lambda que gestionan la lógica y comunicación con la IA.
- `persenaut-infra`: Infraestructura declarada con AWS CDK para facilitar despliegues automatizados.
- `docs`: Documentación del proyecto y guías de uso.
- `models`: Scripts y recursos relacionados con la IA (ej. Ollama).

---

## Estado actual

El proyecto está en fase inicial de desarrollo. Próximamente se implementará la integración con el servicio de IA para generación de retos y el pipeline CI/CD para despliegues automáticos.

---

## Contacto

Para más información o colaboración, contacta a pedrosldev@outlook.es

---

¡Bienvenidos a Persenaut, la aventura del aprendizaje continuo!

