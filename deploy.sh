#!/bin/bash
set -e

# --- КОНФИГУРАЦИЯ ---
MODEM_PATH="/data/local/web"
ARTIFACT_NAME="dist-files"
DOWNLOAD_DIR="./temp_deploy"
DEPLOY_FOLDER="./ready_to_push"

echo "--- Начинаем деплой для dgocker/CPE ---"

# 1. Проверка инструментов
command -v gh >/dev/null 2>&1 || { echo "Ошибка: gh cli не установлен"; exit 1; }
command -v adb >/dev/null 2>&1 || { echo "Ошибка: adb не установлен"; exit 1; }

# 2. Работа с Git
echo "Проверка изменений..."
git add .

# Если изменений нет, создаем пустой коммит, чтобы ПРИНУДИТЕЛЬНО запустить сборку на GitHub
if git diff-index --quiet HEAD --; then
    echo "Изменений нет, создаем пустой триггер для сборки..."
    git commit --allow-empty -m "Force rebuild: $(date +'%Y-%m-%d %H:%M:%S')"
else
    echo "Фиксируем изменения..."
    git commit -m "Auto-deploy: $(date +'%Y-%m-%d %H:%M:%S')"
fi

echo "Пушим на GitHub..."
git push origin main

# 3. Ожидание GitHub Actions
echo "Ждем 15 секунд, чтобы GitHub подхватил задачу..."
sleep 15

echo "Мониторим сборку (это займет время)..."
gh run watch --exit-status

# 4. Подготовка локальных папок
echo "Очистка временных папок..."
rm -rf "$DOWNLOAD_DIR" "$DEPLOY_FOLDER"
mkdir -p "$DOWNLOAD_DIR" "$DEPLOY_FOLDER"

# 5. Скачивание артефакта
echo "Скачиваем артефакт: $ARTIFACT_NAME..."
# Качаем последний успешный артефакт
gh run download --name "$ARTIFACT_NAME" --dir "$DOWNLOAD_DIR"

# Проверка: скачалось ли хоть что-то
if [ -z "$(ls -A "$DOWNLOAD_DIR")" ]; then
    echo "ОШИБКА: Артефакт скачался пустым или не найден!"
    exit 1
fi

# 6. Сборка структуры (умное копирование)
echo "Раскладываем файлы по местам..."

# Проверяем, куда GitHub засунул файлы (иногда он создает лишнюю подпапку с именем артефакта)
SRC_PATH="$DOWNLOAD_DIR"
[ -d "$DOWNLOAD_DIR/$ARTIFACT_NAME" ] && SRC_PATH="$DOWNLOAD_DIR/$ARTIFACT_NAME"

# 1. Копируем всё из dist в корень (если dist существует)
if [ -d "$SRC_PATH/dist" ]; then
    cp -r "$SRC_PATH/dist/"* "$DEPLOY_FOLDER/"
else
    # Если dist нет, значит файлы уже в корне артефакта
    cp -r "$SRC_PATH/"* "$DEPLOY_FOLDER/"
fi

# 2. Копируем cgi-bin в корень
if [ -d "$SRC_PATH/cgi-bin" ]; then
    cp -r "$SRC_PATH/cgi-bin" "$DEPLOY_FOLDER/"
fi

# Удаляем лишнее из папки пуша, если оно туда попало (например, саму папку dist)
rm -rf "$DEPLOY_FOLDER/dist"

# 7. Отправка на модем
echo "Проверка связи с модемом..."
if [[ $(adb devices | wc -l) -lt 3 ]]; then
    echo "ОШИБКА: Модем не виден по ADB! Проверь кабель."
    exit 1
fi

echo "Очистка старых файлов на модеме..."
adb shell "rm -rf $MODEM_PATH/*"

echo "Заливаем новые файлы..."
adb push "$DEPLOY_FOLDER/." "$MODEM_PATH/"

# 8. Права
echo "Выставляем права на CGI..."
adb shell "chmod -R 755 $MODEM_PATH && chmod +x $MODEM_PATH/cgi-bin/* 2>/dev/null || true"

echo "--- [ УСПЕХ ] Деплой завершен! ---"
