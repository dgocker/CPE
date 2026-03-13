#!/bin/bash
set -e

# --- КОНФИГУРАЦИЯ ---
MODEM_PATH="/data/local/web/"
ARTIFACT_NAME="dist-files"
DOWNLOAD_DIR="./temp_deploy"
DEPLOY_FOLDER="./ready_to_push"

echo "--- Начинаем деплой для dgocker/CPE ---"

# 1. Пуш в репозиторий
git add .
if ! git diff-index --quiet HEAD --; then
    git commit -m "Auto-deploy update"
    git push
fi

# 2. Ждем сборку
echo "Ожидаем сборку на GitHub..."
gh run watch --exit-status

# 3. Подготовка папок
rm -rf $DOWNLOAD_DIR $DEPLOY_FOLDER
mkdir -p $DOWNLOAD_DIR $DEPLOY_FOLDER

# 4. Скачивание
echo "Скачиваем артефакты..."
gh run download --name $ARTIFACT_NAME --dir $DOWNLOAD_DIR

# 5. Сборка структуры для модема
# Переносим всё из dist/ в корень папки для пуша
cp -r $DOWNLOAD_DIR/dist/* $DEPLOY_FOLDER/
# Переносим папку cgi-bin в корень папки для пуша
cp -r $DOWNLOAD_DIR/cgi-bin $DEPLOY_FOLDER/

# 6. Отправка на модем
echo "Заливаем на модем..."
adb push $DEPLOY_FOLDER/. $MODEM_PATH

# 7. Права
echo "Устанавливаем права..."
adb shell "chmod +x $MODEM_PATH/cgi-bin/*"

echo "--- Деплой успешно завершен! ---"
