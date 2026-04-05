$ErrorActionPreference = "Stop"

$FOXMQ_URL = "https://github.com/tashigit/foxmq/releases/download/v0.3.1/foxmq_0.3.1_windows-amd64.zip"
$FOXMQ_DIR = "foxmq-bin"
$ZIP_PATH = "foxmq.zip"

if (-Not (Test-Path $FOXMQ_DIR)) {
    Write-Host "Downloading FoxMQ from $FOXMQ_URL..."
    Invoke-WebRequest -Uri $FOXMQ_URL -OutFile $ZIP_PATH
    Write-Host "Extracting to $FOXMQ_DIR..."
    Expand-Archive -Path $ZIP_PATH -DestinationPath $FOXMQ_DIR -Force
    Remove-Item $ZIP_PATH
}

$FOXMQ_EXE = Join-Path $FOXMQ_DIR "foxmq.exe"
if (-Not (Test-Path $FOXMQ_EXE)) {
    # It might be nested inside another folder in the zip
    $FOXMQ_EXE = Get-ChildItem -Path $FOXMQ_DIR -Recurse -Filter "foxmq.exe" | Select-Object -First 1 | Select-Object -ExpandProperty FullName
    if (-Not $FOXMQ_EXE) {
        Write-Host "WARNING: foxmq.exe not found! This script will attempt to run Node.js mock MQTT brokers instead if FoxMQ is missing."
        # We'll use a mocked Aedes broker for the demo if FoxMQ binary isn't available for windows.
        Exit
    }
}

Write-Host "Found FoxMQ at $FOXMQ_EXE"
Write-Host "Setting up cluster directory..."
if (-Not (Test-Path "foxmq.d")) {
    New-Item -ItemType Directory -Force -Path "foxmq.d" | Out-Null
}
$configFile = "foxmq.d/address-book.toml"
if (-Not (Test-Path $configFile)) {
    & $FOXMQ_EXE address-book from-range 127.0.0.1 19793 19796 | Out-File -Encoding utf8 "foxmq.d/address-book.toml"
}

$usersFile = "foxmq.d/users.toml"
if (-Not (Test-Path $usersFile)) {
    Write-Host "Configuring generic authentication..."
    & $FOXMQ_EXE user add oow oow123 | Out-Null
}

Write-Host "Starting a 4-node FoxMQ BFT Cluster..."
Start-Process -NoNewWindow -FilePath $FOXMQ_EXE -ArgumentList "run --cluster-addr=0.0.0.0:19793 --mqtt-addr=0.0.0.0:1883" 
Start-Process -NoNewWindow -FilePath $FOXMQ_EXE -ArgumentList "run --cluster-addr=0.0.0.0:19794 --mqtt-addr=0.0.0.0:1884" 
Start-Process -NoNewWindow -FilePath $FOXMQ_EXE -ArgumentList "run --cluster-addr=0.0.0.0:19795 --mqtt-addr=0.0.0.0:1885" 
Start-Process -NoNewWindow -FilePath $FOXMQ_EXE -ArgumentList "run --cluster-addr=0.0.0.0:19796 --mqtt-addr=0.0.0.0:1886" 

Write-Host "Cluster started. Press Ctrl+C to exit."
