<?php
require_once __DIR__ . '/common.php';
cors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(['error' => 'Method not allowed.'], 405);
$data = body();
$prompt = trim((string)($data['prompt'] ?? ''));
$image = (string)($data['image'] ?? '');
if ($prompt === '' && $image === '') respond(['error' => 'Add a question or upload a homework image first.'], 400);
$model = trim((string)($data['model'] ?? '')) ?: 'qwen/qwen3.8-27b';
$subject = trim((string)($data['subject'] ?? 'General'));
$messages = [];
foreach (array_slice(is_array($data['history'] ?? null) ? $data['history'] : [], -6) as $turn) if (is_array($turn) && in_array($turn['role'] ?? '', ['user', 'assistant'], true) && is_string($turn['content'] ?? null)) $messages[] = ['role' => $turn['role'], 'content' => $turn['content']];
$content = [['type' => 'text', 'text' => tutorPrompt($prompt ?: 'Please explain the attached homework image.', $subject)]];
if (substr($image, 0, 10) === 'data:image/') $content[] = ['type' => 'image_url', 'image_url' => ['url' => $image]];
$messages[] = ['role' => 'user', 'content' => $content];
$result = callGroq($messages, $model);
respond($result, isset($result['answer']) ? 200 : 502);
