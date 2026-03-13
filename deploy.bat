@echo off
chcp 65001 >nul
echo 🚀 Начинаем загрузку файлов на модем...

:: Проверяем подключение устройства
adb get-state >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Ошибка: Устройство не подключено или не авторизовано в ADB.
    echo Убедитесь, что модем подключен и отладка разрешена.
    pause
    exit /b 1
)

:: Опционально: получение root-прав (раскомментируйте, если требуется)
:: echo Получаем root-права...
:: adb root
:: timeout /t 2 /nobreak >nul
:: adb remount

echo 📁 Создаем директории на модеме...
adb shell "mkdir -p /data/local/web/cgi-bin"

echo 🌐 Загружаем веб-интерфейс (из папки dist)...
:: Загружаем содержимое папки dist в корень веб-сервера
adb push dist/. /data/local/web/

echo ⚙️ Загружаем CGI скрипты (из папки cgi-bin)...
:: Загружаем скрипты
adb push cgi-bin/. /data/local/web/cgi-bin/

echo 🔐 Выставляем права доступа...
:: Даем права на чтение и выполнение для всех файлов веб-сервера (755)
adb shell "chmod -R 755 /data/local/web/"
:: Убеждаемся, что CGI скрипты имеют права на выполнение
adb shell "chmod +x /data/local/web/cgi-bin/*"

echo ✅ Загрузка успешно завершена!
pause
