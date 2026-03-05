<?php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    exit;
}

define('DATA_DIR', __DIR__ . '/data');
define('SNAPSHOTS_DIR', DATA_DIR . '/snapshots');
define('LATEST_FILE', DATA_DIR . '/latest.json');

function jsonError(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}

function readLatest(): array {
    if (!file_exists(LATEST_FILE)) {
        jsonError('Data not available', 404);
    }
    $data = json_decode(file_get_contents(LATEST_FILE), true);
    if (!is_array($data)) {
        jsonError('Invalid latest.json', 500);
    }
    return $data;
}

function getProjects(array $snapshot): array {
    return $snapshot['projects'] ?? $snapshot;
}

$action = $_GET['action'] ?? '';

switch ($action) {

    case 'latest':
        $data = readLatest();
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        break;

    case 'regions':
        $latest = readLatest();
        $projects = getProjects($latest);
        $regions = [];
        foreach ($projects as $p) {
            $r = $p['region'] ?? '';
            if ($r !== '' && !in_array($r, $regions, true)) {
                $regions[] = $r;
            }
        }
        sort($regions);
        echo json_encode($regions, JSON_UNESCAPED_UNICODE);
        break;

    case 'history':
        if (!is_dir(SNAPSHOTS_DIR)) {
            echo json_encode(['timestamps' => [], 'projects' => []]);
            break;
        }

        $regionFilter = isset($_GET['region']) && $_GET['region'] !== '' ? $_GET['region'] : null;
        $hours = isset($_GET['hours']) ? (int)$_GET['hours'] : 0;
        if ($hours < 0 || $hours > 720) {
            jsonError('Invalid hours parameter', 400);
        }

        // Collect snapshot files
        $files = glob(SNAPSHOTS_DIR . '/*.json');
        if (!$files) {
            echo json_encode(['timestamps' => [], 'projects' => (object)[]]);
            break;
        }
        sort($files); // chronological order

        // Filter by hours if requested
        if ($hours > 0) {
            $cutoff = time() - $hours * 3600;
            $files = array_filter($files, function($f) use ($cutoff) {
                return filemtime($f) >= $cutoff;
            });
            $files = array_values($files);
        }

        // Limit to max 500 snapshots, sample evenly if more
        $maxSnapshots = 500;
        if (count($files) > $maxSnapshots) {
            $step = count($files) / $maxSnapshots;
            $sampled = [];
            for ($i = 0; $i < $maxSnapshots; $i++) {
                $sampled[] = $files[(int)round($i * $step)];
            }
            $files = $sampled;
        }

        $timestamps = [];
        $projectsMap = [];

        foreach ($files as $file) {
            $raw = file_get_contents($file);
            $snapshot = json_decode($raw, true, 64);
            if (!is_array($snapshot)) continue;

            $ts = $snapshot['fetchedAt'] ?? basename($file, '.json');
            $timestamps[] = $ts;
            $projects = getProjects($snapshot);

            foreach ($projects as $p) {
                $id = (string)($p['id'] ?? '');
                if ($id === '') continue;
                if ($regionFilter !== null && ($p['region'] ?? '') !== $regionFilter) continue;

                if (!isset($projectsMap[$id])) {
                    $projectsMap[$id] = [
                        'title' => $p['title'] ?? '',
                        'region' => $p['region'] ?? '',
                        'city' => $p['city'] ?? '',
                        'category' => $p['category'] ?? '',
                        'votes' => [],
                    ];
                }
                $projectsMap[$id]['votes'][] = (int)($p['votesCount'] ?? 0);
            }
        }

        echo json_encode([
            'timestamps' => $timestamps,
            'projects' => $projectsMap,
        ], JSON_UNESCAPED_UNICODE);
        break;

    default:
        jsonError('Unknown action. Use: latest, regions, history');
}
