$ErrorActionPreference = "Continue"
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$port = 9390
$userData = "$env:TEMP\edge_cdp_sync_test_$(Get-Random)"
$proc = Start-Process -FilePath $edge -ArgumentList @("--headless=new","--disable-gpu","--remote-debugging-port=$port","--user-data-dir=$userData","--no-first-run","--disk-cache-size=1","--window-size=1024,768") -PassThru
Start-Sleep -Seconds 3
$targets = $null
foreach($i in 1..10){ 
    try { 
        $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" 
        if(@($targets | Where-Object {$_.type -eq 'page'}).Count -gt 0){ break } 
    } catch { Start-Sleep -Milliseconds 800 } 
}
if (-not $targets) { Write-Error "No pages found"; Stop-Process -Id $proc.Id -Force; exit 1 }
$page = @($targets | Where-Object {$_.type -eq 'page'})[0]
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl,$ct).Wait() | Out-Null
$script:cmdId = 0
function Read-Msg{
    $ms = New-Object System.IO.MemoryStream
    $buf = New-Object byte[] 1mb
    do{
        $sb = New-Object System.ArraySegment[byte](,$buf)
        $task = $ws.ReceiveAsync($sb,$ct)
        $task.Wait()
        if($task.Result.Count -gt 0){ $ms.Write($buf,0,$task.Result.Count) }
    }while(-not $task.Result.EndOfMessage)
    [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
}
function Send-Cmd($obj){
    $script:cmdId++
    $obj.id = $script:cmdId
    $json = $obj | ConvertTo-Json -Depth 12 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $seg = New-Object System.ArraySegment[byte](,$bytes)
    $ws.SendAsync($seg,[System.Net.WebSockets.WebSocketMessageType]::Text,$true,$ct).Wait() | Out-Null
    for($k=0;$k -lt 150;$k++){
        $msg = (Read-Msg) | ConvertFrom-Json
        if($msg.id -eq $script:cmdId){ return $msg }
    }
    throw "Timeout waiting for response"
}
function Eval([string]$expr){
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($expr))
    $r = Send-Cmd @{method="Runtime.evaluate";params=@{expression="eval(atob('$b64'))";awaitPromise=$true;returnByValue=$true}}
    return $r.result.result.value
}
# Navigate to app
Send-Cmd @{method="Page.navigate";params=@{url="file:///C:/Users/roser/midweek/index.html"}} | Out-Null
Start-Sleep -Seconds 3
# Wait for app to load (we can check for existence of a variable)
$r = Eval "typeof S !== 'undefined' ? 'S ready' : 'waiting'"
Write-Output "App state: $r"
Start-Sleep -Seconds 2
# Now we will simulate a change: add a meal to Monday dinner
# We'll use the pushMeal function from app.js
# We need to find a recipe id to use; we can just create a free meal (note)
# Let's call addMealFlow with a key and then simulate clicking the free meal button? Simpler: directly call pushMeal with a dummy meal.
# But we need to ensure the menu slot exists.
# Let's just set S.menu['2026-09-07|sopars'] = [{recipeId: 1, diners: 2}] where recipeId 1 exists? We don't know.
# Instead, we can modify a simple setting like diners.
# Let's change S.diners to 5 and save.
$r = Eval "S.diners = 5; save(); 'diners set to 5'"
Write-Output $r
Start-Sleep -Seconds 2
# Now fetch the Gist to see if it updated
# We need token and gistId from config.js
# We'll read config.js via file system (since we have access)
$config = Get-Content -Raw "C:\Users\roser\midweek/config.js"
if($config -match 'token:\s*"([^"]+)"'){ $token = $matches[1] }
if($config -match 'gistId:\s*"([^"]+)"'){ $gistId = $matches[1] }
if(-not $token -or -not $gistId){ Write-Error "Could not extract token or gistId from config.js"; Stop-Process -Id $proc.Id -Force; exit 1 }
Write-Output "Token: $token"
Write-Output "Gist ID: $gistId"
Start-Sleep -Seconds 2
$gistUrl = "https://api.github.com/gists/$gistId"
$gistResponse = Invoke-RestMethod -Headers @{Authorization = "Bearer $token"; Accept = "application/vnd.github+json"} -Uri $gistUrl -Method Get
$content = $gistResponse.files.'midweek-state.json'.content
$state = $content | ConvertFrom-Json
Write-Output "Gist state diners: $($state.diners)"
Write-Output "Gist state _syncedAt: $($state._syncedAt)"
# Expect diners to be 5
if($state.diners -eq 5){
    Write-Output "SUCCESS: Gist updated with new diners value."
} else {
    Write-Error "FAILURE: Gist diners is $($state.diners), expected 5."
}
# Clean up
Eval "localStorage.clear(); 'cleared'" | Out-Null
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Write-Output "TEST COMPLETE"