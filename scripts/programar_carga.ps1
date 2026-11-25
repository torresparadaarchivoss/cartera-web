# Registra la tarea de carga cada hora, de lunes a viernes, de 8:05 a 18:05 (hora de la mÃ¡quina).
# Corre solo cuando la sesiÃ³n del usuario estÃ¡ iniciada (-IT): no guarda contraseÃ±a. Requiere la variable de
# entorno SUPABASE_DB_URL en el perfil del usuario. Para quitarla: schtasks /Delete /TN CarteraCargaHoraria /F
#
# Uso (PowerShell, desde scripts/):  .\programar_carga.ps1

$ErrorActionPreference = 'Stop'
$nombre = 'CarteraCargaHoraria'
$python = 'C:\Users\jctorresp\Videos\dashboard_cartera\.venv\Scripts\python.exe'
$script = Join-Path $PSScriptRoot 'carga_programada.py'
$tr = "`"$python`" `"$script`""

schtasks /Create /TN $nombre /TR $tr /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 08:05 /RI 60 /DU 10:00 /F /IT
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la tarea $nombre." }
schtasks /Query /TN $nombre /V /FO LIST | Select-String -Pattern 'PrÃ³xima ejecuciÃ³n|Next Run Time|Tarea programada|Task To Run|Estado|Status'

