<?php
/**
 * EasyNote Configuration
 */

// Data directory for storing notes
$data_dir = __DIR__ . '/_notes/';

// Site title
$site_title = 'EasyNote';

// Enable/disable API access
$allow_api = true;

// Auto-detect base URL
$base_url = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/');
if ($base_url === '.' || $base_url === '\\') {
    $base_url = '';
}

// Default note (when accessing root URL)
$default_note = '';

// Encryption cipher
$cipher = 'aes-256-cbc';
