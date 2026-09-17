<?php

const AI_TUTOR_MODELS = [
  ['id' => 'qwen/qwen3.8-27b', 'name' => 'Qwen 3.8 27B', 'provider' => 'Alibaba', 'tier' => 'balanced', 'supportsImages' => true],
  ['id' => 'openai/gpt-oss-120b', 'name' => 'GPT OSS 120B', 'provider' => 'OpenAI', 'tier' => 'powerful', 'supportsImages' => false],
  ['id' => 'openai/gpt-oss-20b', 'name' => 'GPT OSS 20B', 'provider' => 'OpenAI', 'tier' => 'fast', 'supportsImages' => false],
  ['id' => 'groq/compound', 'name' => 'Compound', 'provider' => 'Groq', 'tier' => 'powerful', 'supportsImages' => false],
  ['id' => 'groq/compound-mini', 'name' => 'Compound Mini', 'provider' => 'Groq', 'tier' => 'fast', 'supportsImages' => false],
];

function cors(): void { header('Access-Control-Allow-Origin: *'); header('Access-Control-Allow-Headers: Content-Type'); header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS'); }
function respond(array $payload, int $status = 200): void { http_response_code($status); header('Content-Type: application/json; charset=utf-8'); echo json_encode($payload); exit; }
function body(): array { $decoded = json_decode(file_get_contents('php://input') ?: '{}', true); return is_array($decoded) ? $decoded : []; }
function groqKey(): string { return (string)(getenv('GROQ_API_KEY') ?: ($_ENV['GROQ_API_KEY'] ?? '')); }
function tutorPrompt(string $request, string $subject): string { return "You are AI Tutor for PK through college students. Answer first, then show work step by step. Adapt to the student's level. Use plain text/basic markdown only; never use LaTeX. For math show every calculation, fractions and decimals. End with a Practice section containing one similar problem. Subject: {$subject}. Student request: {$request}"; }
function callGroq(array $messages, string $model): array {
  $key = groqKey(); if (!$key) return ['error' => 'Groq is not configured. Add GROQ_API_KEY in InfinityFree environment/configuration.'];
  $payload = json_encode(['model' => $model, 'messages' => $messages, 'temperature' => 0.35, 'max_tokens' => 1200]);
  $endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  $raw = false;
  if (function_exists('curl_init')) {
    $curl = curl_init($endpoint);
    curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_HTTPHEADER => ["Content-Type: application/json", "Authorization: Bearer {$key}"], CURLOPT_POSTFIELDS => $payload]);
    $raw = curl_exec($curl);
    curl_close($curl);
  }
  if ($raw === false || $raw === '') {
    $context = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/json\r\nAuthorization: Bearer {$key}\r\n", 'content' => $payload, 'timeout' => 60, 'ignore_errors' => true]]);
    $raw = @file_get_contents($endpoint, false, $context);
  }
  $result = json_decode($raw ?: '', true); $answer = $result['choices'][0]['message']['content'] ?? null;
  return is_string($answer) && trim($answer) !== '' ? ['answer' => $answer] : ['error' => 'Groq did not return an answer. Check the API key and model.'];
}
function chatFile(): string { $dir = __DIR__ . '/data'; if (!is_dir($dir)) @mkdir($dir, 0755, true); return $dir . '/chats.json'; }
function loadChats(): array { $raw = @file_get_contents(chatFile()); $data = json_decode($raw ?: '[]', true); return is_array($data) ? $data : []; }
function saveChats(array $chats): void { @file_put_contents(chatFile(), json_encode(array_slice($chats, -200)), LOCK_EX); }
