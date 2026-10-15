# Vagas Gamedev -> Discord

Verifica as vagas novas no **r/gameDevClassifieds** e no **r/forhire** e posta no canal do seu Discord
as de **contratação paga** para **Programação/Unity** ou **3D**. Ficam de fora quem oferece serviço,
vagas sem pagamento, pixel art, ilustração, música, voz, tradução, teste e marketing.

## 1. Criar o webhook (1 minuto)
1. No Discord, no **seu** servidor, crie um canal, por exemplo `#vagas`.
2. Engrenagem do canal > **Integrações** > **Webhooks** > **Novo webhook** > **Copiar URL do webhook**.
3. Abra `config.json` nesta pasta e cole a URL no lugar de `COLE_AQUI_O_WEBHOOK_DO_SEU_CANAL`.

A URL do webhook funciona como uma senha do canal: não compartilhe nem publique.

## 2. Rodar
- **Teste (não posta nada):** `node vagas.js --dry-run`
- **Uma vez:** `node vagas.js`
- **Sempre ligado:** dois cliques em `rodar.bat` e deixe a janela aberta (pode minimizar).

Na primeira execução ele posta as vagas recentes que já passam no filtro. Depois, só as novas.
O que já foi visto fica em `seen.json` (apague o arquivo para recomeçar do zero).

## 3. Ajustar
Edite `config.json` (os padrões ficam em `vagas.js`, em `DEFAULTS`):
- `subreddits`: lista de subreddits.
- `checkMinutes`: intervalo entre verificações.
- Para mudar as funções ou as palavras excluídas, copie `roles` ou `excludeTags` de `DEFAULTS` para o `config.json` e edite.

## Alerta no celular
No app do Discord, segure o canal `#vagas` > **Notificações** > **Todas as mensagens**.

## Na nuvem (sempre ativo)
O monitor roda sozinho a cada 15 minutos no GitHub Actions, mesmo com o PC desligado:
https://github.com/wallasace/discord-job-alerts/actions

- Os webhooks ficam no Secret `CONFIG_JSON` do repositório (Settings > Secrets and variables > Actions).
- **Não rode o `rodar.bat` ao mesmo tempo**: o PC e a nuvem têm listas de "vistas" separadas e as vagas sairiam duplicadas.
- Para pausar: aba Actions > "Job alerts" > "..." > Disable workflow.
- O GitHub desliga agendamentos de repositórios públicos após 60 dias sem nenhum commit. Os commits automáticos do `seen.json` mantêm o repositório ativo enquanto houver vagas novas; se o workflow for desligado, é só reativar na aba Actions.
