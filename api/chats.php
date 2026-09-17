<?php
require_once __DIR__ . '/common.php';
cors();
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
$method = $_SERVER['REQUEST_METHOD']; $id = trim((string)($_GET['id'] ?? '')); $chats = loadChats();
$summary = static function (array $chat): array { $first = $chat['messages'][0]['content'] ?? ''; if (is_array($first)) $first = $first[0]['text'] ?? ''; return ['id' => $chat['id'], 'title' => $chat['title'] ?? (substr((string)$first, 0, 60) ?: 'Untitled chat'), 'subject' => $chat['subject'] ?? 'Math', 'created' => $chat['created'] ?? 0, 'updated' => $chat['updated'] ?? 0]; };
if ($method === 'GET' && $id === '') { usort($chats, fn($a, $b) => ($b['updated'] ?? 0) <=> ($a['updated'] ?? 0)); respond(['chats' => array_map($summary, $chats)]); }
if ($method === 'GET' && $id !== '') { foreach ($chats as $chat) if (($chat['id'] ?? '') === $id) respond(['chat' => $chat]); respond(['error' => 'Chat not found.'], 404); }
$data = body();
if ($method === 'POST' && $id === '') { $messages = array_values(array_filter(array_slice(is_array($data['messages'] ?? null) ? $data['messages'] : [], 0, 80), fn($turn) => is_array($turn) && in_array($turn['role'] ?? '', ['user', 'assistant'], true) && is_string($turn['content'] ?? null))); if (!$messages) respond(['error' => 'A chat needs at least one message.'], 400); $now = time(); $chat = ['id' => bin2hex(random_bytes(6)), 'subject' => $data['subject'] ?? 'General', 'messages' => $messages, 'created' => $now, 'updated' => $now]; $chat['title'] = $summary($chat)['title']; $chats[] = $chat; saveChats($chats); respond(['chat' => $chat]); }
if ($method === 'POST' && $id !== '') { foreach ($chats as &$chat) if (($chat['id'] ?? '') === $id) { if (is_array($data['add'] ?? null) && in_array($data['add']['role'] ?? '', ['user', 'assistant'], true)) $chat['messages'][] = $data['add']; $chat['messages'] = array_slice($chat['messages'], -80); $chat['updated'] = time(); saveChats($chats); respond(['chat' => $chat]); } respond(['error' => 'Chat not found.'], 404); }
if ($method === 'DELETE' && $id !== '') { $remaining = array_values(array_filter($chats, fn($chat) => ($chat['id'] ?? '') !== $id)); if (count($remaining) === count($chats)) respond(['error' => 'Chat not found.'], 404); saveChats($remaining); respond(['ok' => true]); }
respond(['error' => 'Method not allowed.'], 405);
