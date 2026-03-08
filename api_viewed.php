<?php
/**
 * api_viewed.php
 * A simple API to read/write viewed trader addresses to a server-side JSON file.
 * Compatible with most shared hosting environments.
 */

$file = 'viewed.json';

// Initialize file if it doesn't exist
if (!file_exists($file)) {
    file_put_contents($file, json_encode([]));
}

// Set JSON response header
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // Allow local development to talk to server
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Load existing data
$currentData = json_decode(file_get_contents($file), true) ?? [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Read the incoming JSON body
    $input = json_decode(file_get_contents('php://input'), true);
    $addr = isset($input['address']) ? strtolower(trim($input['address'])) : null;

    if ($addr && !in_array($addr, $currentData)) {
        $currentData[] = $addr;
        file_put_contents($file, json_encode($currentData, JSON_PRETTY_PRINT));
    }
    
    echo json_encode($currentData);
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode($currentData);
} else {
    // Respond to OPTIONS (preflight) or other methods
    http_response_code(200);
}
?>
