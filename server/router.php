<?php
// Development only: never serve project files or secrets from the PHP server.
if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) === '/api.php') {
    require __DIR__ . '/api.php';
} else {
    http_response_code(404);
}
