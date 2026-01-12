<?php 
if (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') {
    $uri = 'https://';
} else {
    $uri = 'http://';
}
$uri .= $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
header('Location: ' . rtrim($uri, '/') . '/yesda/');
exit;
?>
