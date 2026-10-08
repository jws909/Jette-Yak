#requires -Version 7.0
param(
    [string]$BaseUrl = 'http://localhost:5173',
    [switch]$WithDemo
)

# 조회 요청만 검사. 선택한 체험 로그인/로그아웃 외에 저장·삭제·메일·AI 요청 없음
$ErrorActionPreference = 'Stop'
$results = [System.Collections.Generic.List[object]]::new()
function Check-Get([string]$Name, [string]$Path, [int[]]$Expected, $Session) {
    try {
        $options = @{ Uri = $BaseUrl + $Path; SkipHttpErrorCheck = $true; TimeoutSec = 20 }
        if ($Session) { $options.WebSession = $Session }
        $response = Invoke-WebRequest @options
        $status = [int]$response.StatusCode
        # 응답 원문과 사용자 정보는 보고서에 남기지 않음
        $results.Add([pscustomobject]@{ Check = $Name; Status = $status; Expected = ($Expected -join '/'); Passed = $Expected -contains $status })
    } catch {
        $results.Add([pscustomobject]@{ Check = $Name; Status = 0; Expected = ($Expected -join '/'); Passed = $false; ErrorType = $_.Exception.GetType().Name })
    }
}

Check-Get 'public community list' '/api/community/posts?page=1' @(200) $null
Check-Get 'public community partial search' '/api/community/posts?q=%ED%85%90&page=1' @(200) $null
Check-Get 'public medication name search' '/api/medications/search?q=%ED%85%90&page=1' @(200) $null
Check-Get 'public calendar medication search' '/api/calendar/search-medications?keyword=%ED%85%90' @(200) $null
Check-Get 'anonymous calendar denied' '/api/calendar?date=2026-10-07' @(401) $null
Check-Get 'anonymous prescription list denied' '/api/prescriptions/list' @(401) $null
Check-Get 'anonymous prescription latest denied' '/api/prescriptions/latest' @(401) $null
Check-Get 'anonymous profile denied' '/api/users/profile?username=qa_nonexistent_user' @(401) $null
Check-Get 'anonymous routine medications denied' '/api/users/everyday-meds' @(401) $null
Check-Get 'anonymous meal settings denied' '/api/users/meal-times' @(401) $null
Check-Get 'anonymous push settings denied' '/api/users/push-settings' @(401) $null
Check-Get 'anonymous device push config denied' '/api/push/config' @(401) $null
Check-Get 'anonymous family denied' '/api/family/members' @(401) $null
Check-Get 'anonymous collection denied' '/api/guides/collection' @(401) $null
Check-Get 'anonymous notifications denied' '/api/notifications' @(401) $null
Check-Get 'anonymous chat history denied' '/api/chat/conversations' @(401) $null
Check-Get 'anonymous admin denied' '/api/community/admin/reports' @(401,403) $null

if ($WithDemo) {
    # 테스트 전용 세션. 브라우저 세션이나 일반 로그인 쿠키를 재사용하지 않음
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    try {
        $login = Invoke-WebRequest -Uri ($BaseUrl + '/api/auth/demo') -Method Post -WebSession $session -SkipHttpErrorCheck -TimeoutSec 20
        if ([int]$login.StatusCode -ne 200) { throw 'Demo login unavailable' }
        Check-Get 'signed-in calendar' '/api/calendar?date=2026-10-07' @(200) $session
        Check-Get 'signed-in prescriptions' '/api/prescriptions/list' @(200) $session
        Check-Get 'signed-in routine medications' '/api/users/everyday-meds' @(200) $session
        Check-Get 'signed-in meal settings' '/api/users/meal-times' @(200) $session
        Check-Get 'signed-in push settings' '/api/users/push-settings' @(200) $session
        Check-Get 'signed-in device push config' '/api/push/config' @(200) $session
        Check-Get 'signed-in family' '/api/family/members' @(200) $session
        Check-Get 'signed-in collection' '/api/guides/collection' @(200) $session
        Check-Get 'signed-in collection warnings' '/api/guides/collection/dur' @(200) $session
        Check-Get 'signed-in notifications' '/api/notifications' @(200) $session
        Check-Get 'signed-in chat history' '/api/chat/conversations' @(200) $session
        Check-Get 'invalid calendar date denied' '/api/calendar?date=2026-99-99' @(400) $session
        Check-Get 'invalid calendar month denied' '/api/calendar/summary?yearMonth=2026-99' @(400) $session
        Check-Get 'invalid user number denied' '/api/calendar?userId=-1&date=2026-10-07' @(400) $session
        # 존재할 수 없는 번호로 접근 거부만 확인. 타인의 실제 정보 조회 없음
        Check-Get 'foreign calendar denied' '/api/calendar?userId=9007199254740991&date=2026-10-07' @(403,404) $session
        Check-Get 'foreign prescription list denied' '/api/prescriptions/list?userId=9007199254740991' @(403,404) $session
        Check-Get 'foreign routine medications denied' '/api/users/everyday-meds?userId=9007199254740991' @(403,404) $session
        # CSRF 토큰 없이 쓰기 요청하면 본문 처리 전에 거부되어야 함. 구독 변경 없음
        $denied = Invoke-WebRequest -Uri ($BaseUrl + '/api/push/subscriptions/status') -Method Post -WebSession $session -ContentType 'application/json' -Body '{"endpoint":"https://example.invalid/qa"}' -SkipHttpErrorCheck -TimeoutSec 20
        $results.Add([pscustomobject]@{ Check = 'device push request without CSRF denied'; Status = [int]$denied.StatusCode; Expected = '403'; Passed = [int]$denied.StatusCode -eq 403 })
    } catch {
        $results.Add([pscustomobject]@{ Check = 'demo session setup'; Status = 0; Expected = '200'; Passed = $false; ErrorType = $_.Exception.GetType().Name })
    } finally {
        Invoke-WebRequest -Uri ($BaseUrl + '/api/auth/logout') -Method Post -WebSession $session -SkipHttpErrorCheck -TimeoutSec 20 | Out-Null
    }
}
$results | Format-Table -AutoSize
$failed = @($results | Where-Object { -not $_.Passed })
Write-Output ('HTTP checks: ' + ($results.Count - $failed.Count) + '/' + $results.Count + ' passed')
if ($failed.Count) { exit 1 }
