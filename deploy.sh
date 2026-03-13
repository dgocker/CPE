#!/bin/bash
set -e

# --- КОНФИГУРАЦИЯ ---
MODEM_PATH="/data/local/web"
ARTIFACT_NAME="dist-files"
DOWNLOAD_DIR="./temp_deploy"
DEPLOY_FOLDER="./ready_to_push"

echo "--- Начинаем деплой для dgocker/CPE ---"

# 1. Работа с Git
echo "Проверка изменений..."
git add .

if git diff-index --quiet HEAD --; then
    echo "Изменений нет, создаем пустой триггер для сборки..."
    git commit --allow-empty -m "Force rebuild: $(date +'%Y-%m-%d %H:%M:%S')"
else
    echo "Фиксируем изменения..."
    git commit -m "Auto-deploy: $(date +'%Y-%m-%d %H:%M:%S')"
fi

echo "Пушим на GitHub..."
git push origin main

# 2. Ожидание запуска сборки
echo "Ждем 15 секунд, чтобы GitHub завел мотор..."
sleep 15

# 3. Поиск ID последней сборки (вместо --latest)
echo "Ищем ID последней запущенной сборки..."
RUN_ID=$(gh run list --limit 1 --json databaseId -q '.[0].databaseId')

if [ -z "$RUN_ID" ] || [ "$RUN_ID" == "null" ]; then
    echo "ОШИБКА: Не удалось найти запущенную сборку на GitHub!"
    exit 1
fi

echo "Следим за сборкой ID: $RUN_ID..."
gh run watch "$RUN_ID" --exit-status

# 4. Подготовка локальных папок
echo "Очистка временных папок..."
rm -rf "$DOWNLOAD_DIR" "$DEPLOY_FOLDER"
mkdir -p "$DOWNLOAD_DIR" "$DEPLOY_FOLDER"

# 5. Скачивание артефакта
echo "Скачиваем артефакт: $ARTIFACT_NAME..."
gh run download "$RUN_ID" --name "$ARTIFACT_NAME" --dir "$DOWNLOAD_DIR"

# Проверка скачивания
if [ -z "$(ls -A "$DOWNLOAD_DIR")" ]; then
    echo "ОШИБКА: Артефакт не найден или пуст!"
    exit 1
fi

# 6. Сборка структуры
echo "Раскладываем файлы..."
SRC_PATH="$DOWNLOAD_DIR"
# Если gh создал подпапку с именем артефакта
[ -d "$DOWNLOAD_DIR/$ARTIFACT_NAME" ] && SRC_PATH="$DOWNLOAD_DIR/$ARTIFACT_NAME"

if [ -d "$SRC_PATH/dist" ]; then
    cp -r "$SRC_PATH/dist/"* "$DEPLOY_FOLDER/"
else
    cp -r "$SRC_PATH/"* "$DEPLOY_FOLDER/"
fi

[ -d "$SRC_PATH/cgi-bin" ] && cp -r "$SRC_PATH/cgi-bin" "$DEPLOY_FOLDER/"
rm -rf "$DEPLOY_FOLDER/dist" # Чистим мусор, если он попал внутрь

# 7. Отправка на модем
echo "Проверка связи с модемом..."
if [[ $(adb devices | wc -l) -lt 3 ]]; then
    echo "ОШИБКА: ADB не видит модем!"
    exit 1
fi

echo "Заливка на модем..."
adb shell "rm -rf $MODEM_PATH/*"
adb push "$DEPLOY_FOLDER/." "$MODEM_PATH/"

# 8. Права
echo "Настройка прав..."
adb shell "chmod -R 755 $MODEM_PATH && chmod +x $MODEM_PATH/cgi-bin/* 2>/dev/null || true"

echo "--- [ ГОТОВО ] ---"
