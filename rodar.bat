@echo off
REM Fica rodando e verifica vagas a cada 15 minutos. Deixe esta janela aberta (pode minimizar).
cd /d "%~dp0"
node vagas.js --loop
pause
