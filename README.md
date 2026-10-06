# Evolua

App pessoal (PWA) para registrar treinos de musculação: execução rápida do treino, cronômetro de descanso, progressão de cargas, mapa muscular, histórico e calendário.

- HTML/CSS/JS puro, sem build. Abra `index.html` por um servidor http (ex.: `python -m http.server`).
- Os dados ficam no navegador do aparelho (localStorage). Use **Preferências → Exportar backup** com frequência.
- Ao publicar uma nova versão, altere `VERSION` em `sw.js` para o app atualizar no celular.
