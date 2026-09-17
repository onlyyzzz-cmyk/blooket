<?php
require_once __DIR__ . '/common.php';
cors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
if ($_SERVER['REQUEST_METHOD'] !== 'GET') respond(['error' => 'Method not allowed.'], 405);
respond(['models' => AI_TUTOR_MODELS]);
