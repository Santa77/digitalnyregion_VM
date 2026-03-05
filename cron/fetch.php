<?php

define('API_URL', 'https://www.digitalnyregion.sk/api/projects?limit=100');
define('DATA_DIR', __DIR__ . '/../data');
define('SNAPSHOTS_DIR', DATA_DIR . '/snapshots');
define('LATEST_FILE', DATA_DIR . '/latest.json');
define('LOG_FILE', DATA_DIR . '/fetch.log');

function logMessage(string $message): void {
    $line = date('Y-m-d H:i:s') . ' | ' . $message . PHP_EOL;
    file_put_contents(LOG_FILE, $line, FILE_APPEND | LOCK_EX);
}

function fetchData() {
    $ctx = stream_context_create([
        'http' => [
            'timeout' => 15,
            'method' => 'GET',
            'header' => "Accept: application/json\r\nUser-Agent: VotingMonitor/1.0\r\n",
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ],
    ]);
    return file_get_contents(API_URL, false, $ctx);
}

// Ensure directories exist
if (!is_dir(SNAPSHOTS_DIR)) {
    mkdir(SNAPSHOTS_DIR, 0755, true);
}

// Fetch data
$raw = fetchData();
if ($raw === false) {
    $err = error_get_last();
    $detail = $err ? $err['message'] : 'unknown error';
    logMessage('ERROR: Failed to fetch data from API – ' . $detail);
    exit(1);
}

// Validate JSON
$data = json_decode($raw, true);
if (!is_array($data)) {
    logMessage('ERROR: Invalid JSON response – ' . json_last_error_msg());
    exit(1);
}

// Count projects (support both array and {data: [...]} response shapes)
$projects = isset($data['data']) ? $data['data'] : $data;
$count = count($projects);

// Save snapshot
$timestamp = date('Y-m-d_H-i');
$snapshotFile = SNAPSHOTS_DIR . '/' . $timestamp . '.json';

// Add metadata wrapper
$snapshot = [
    'fetchedAt' => date('c'),
    'count' => $count,
    'projects' => $projects,
];
$encoded = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

file_put_contents($snapshotFile, $encoded, LOCK_EX);
$tmpFile = LATEST_FILE . '.tmp';
file_put_contents($tmpFile, $encoded, LOCK_EX);
rename($tmpFile, LATEST_FILE);

logMessage("OK: {$count} projects saved to {$timestamp}.json");
