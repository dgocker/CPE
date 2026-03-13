#!/bin/bash
set -e

# --- КОНФИГУРАЦИЯ ---
MODEM_PATH="/data/local/web/"
ARTIFACT_NAME="dist-files"
DOWNLOAD_DIR="./temp_deploy"
DEPLOY_FOLDER="./ready_to_push"

echo "--- Начинаем деплой для dgocker/CPE ---"

# 1. Пуш в репозиторий
if [[ -n $(git status -s) ]]; then
    echo "Фиксируем изменения..."
    git add .
    git commit -m "Auto-deploy: $(date +'%Y-%m-%d %H:%M:%S')"
    git push origin main
else
    echo "Изменений нет, пропускаем пуш."
fi

# 2. Ждем, пока GitHub проснется и начнет сборку
echo "Ждем 10 секунд для запуска GitHub Actions..."
sleep 10

# 3. Мониторим сборку
echo "Ожидаем завершения сборки..."
gh run watch --exit-status

# 4. Подготовка папок
rm -rf "$DOWNLOAD_DIR" "$DEPLOY_FOLDER"
mkdir -p "$DOWNLOAD_DIR" "$DEPLOY_FOLDER"

# 5. Скачивание артефактов
echo "Скачиваем артефакты..."
gh run download --name "$ARTIFACT_NAME" --dir "$DOWNLOAD_DIR"

# 6. Сборка структуры для модема
echo "Подготовка файлов..."
if [ -d "$DOWNLOAD_DIR/dist" ]; then
    cp -r "$DOWNLOAD_DIR/dist/"* "$DEPLOY_FOLDER/"
else
    # Если артефакт скачался без вложенной папки dist
    cp -r "$DOWNLOAD_DIR/"* "$DEPLOY_FOLDER/"
fi

# Если есть cgi-bin, переносим отдельно (с проверкой)
[ -d "$DOWNLOAD_DIR/cgi-bin" ] && cp -r "$DOWNLOAD_DIR/cgi-bin" "$DEPLOY_FOLDER/"

# 7. Отправка на модем
echo "Заливаем на модем по ADB..."
adb push "$DEPLOY_FOLDER/." "$MODEM_PATH"

# 8. Права
echo "Устанавливаем права на исполнение..."
adb shell "chmod +x $MODEM_PATH/cgi-bin/* 2>/dev/null || true"

echo "--- Деплой успешно завершен! ---"
