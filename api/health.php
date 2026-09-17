<?php
require_once __DIR__ . '/common.php';
cors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
respond(['ok' => true, 'configured' => groqKey() !== '', 'model' => 'qwen/qwen3.8-27b']);
