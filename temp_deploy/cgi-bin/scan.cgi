#!/system/bin/sh

# Заголовки для браузера
echo "Content-Type: application/json"
echo "Cache-Control: no-cache"
echo ""

PORT="/dev/smd11"
LOCKDIR="/data/local/tmp/modem_cops.lock"
RAW_LOG="/data/local/tmp/cops_raw.log"
RESULT_FILE="/data/local/tmp/modem_cops.txt"
DEBUG_LOG="/data/local/tmp/scan_debug.log"

ACTION="${QUERY_STRING##*action=}"
ACTION="${ACTION%%&*}"

log() {
    echo "$(date '+%H:%M:%S') - $1" >> "$DEBUG_LOG"
}

# Функция очистки порта (ВАШ КОД)
kill_smd_users() {
    for f in /proc/[0-9]*/fd/*; do
        target=$(busybox readlink "$f" 2>/dev/null)
        case "$target" in
            */dev/smd11*)
                pid="${f#/proc/}"; pid="${pid%%/*}"
                [ "$pid" != "$$" ] && kill -9 "$pid" 2>/dev/null
                ;;
        esac
    done
}

if [ "$ACTION" = "log" ]; then
    echo "=== DEBUG LOG ==="
    [ -f "$DEBUG_LOG" ] && cat "$DEBUG_LOG" || echo "Log empty"
    exit 0
fi

if [ "$ACTION" = "start" ]; then
    if ! mkdir "$LOCKDIR" 2>/dev/null; then
        echo '{"status": "error", "message": "Already running"}'
        exit 0
    fi

    > "$DEBUG_LOG"
    > "$RAW_LOG"
    > "$RESULT_FILE"

    log "=== START SCAN ==="
    kill_smd_users # Освобождаем порт перед началом

    busybox stty -F "$PORT" 115200 raw -echo

    (
        trap 'rmdir "$LOCKDIR" 2>/dev/null; exec 3>&- 2>/dev/null' EXIT INT TERM

        if exec 3<>"$PORT"; then
            log "Port opened on FD 3"
            cat <&3 >> "$RAW_LOG" &
            CAT_PID=$!

            wait_cmd() {
                local timeout=$1
                local cmd=$2
                local marker="MARKER_$(date +%s)_$timeout"
                echo "$marker" >> "$RAW_LOG"
                echo -e "$cmd\r" >&3
                log "Sent: $cmd"

                local count=0
                while [ "$count" -lt "$timeout" ]; do
                    if busybox sed -n "/$marker/,\$p" "$RAW_LOG" | busybox grep -qE "OK|ERROR"; then
                        log "Got response for $cmd"
                        return 0
                    fi
                    sleep 2
                    count=$((count + 2))
                done
                log "Timeout for $cmd"
                return 1
            }

            # ПОСЛЕДОВАТЕЛЬНОСТЬ
            wait_cmd 15 "AT+COPS=2"  # Уходим в офлайн
            wait_cmd 180 "AT+COPS=?" # Ищем сети

            # МЫ НЕ ОТПРАВЛЯЕМ COPS=0, чтобы модем не подключался сам

            kill -9 "$CAT_PID" 2>/dev/null
            exec 3>&-

            busybox grep "+COPS:" "$RAW_LOG" | busybox tr -d '\r' > "$RESULT_FILE"
            log "=== FINISHED ==="
        fi
    ) >/dev/null 2>&1 </dev/null &

    echo '{"status": "started"}'
    exit 0

elif [ "$ACTION" = "status" ]; then
    if [ -d "$LOCKDIR" ]; then
        echo '{"status": "scanning"}'
    elif [ -f "$RESULT_FILE" ]; then
        DATA=$(cat "$RESULT_FILE" | busybox tr '\n' ' ' | busybox sed 's/"/\\"/g')
        [ -z "$DATA" ] && DATA="No operators found"
        echo "{\"status\": \"done\", \"data\": \"$DATA\"}"
    else
        echo '{"status": "idle"}'
    fi
    exit 0

elif [ "$ACTION" = "exec" ]; then
    CMD="${QUERY_STRING##*cmd=}"
    CMD="${CMD%%&*}"
    
    # URL Decode
    CMD="${CMD//+/ }"
    CMD=$(printf '%b' "${CMD//%/\\x}")

    if [ -z "$CMD" ]; then
        echo '{"status": "error", "message": "No command provided"}'
        exit 0
    fi

    if ! mkdir "$LOCKDIR" 2>/dev/null; then
        echo '{"status": "error", "message": "Modem is busy"}'
        exit 0
    fi

    > "$RAW_LOG"
    kill_smd_users
    busybox stty -F "$PORT" 115200 raw -echo

    if exec 3<>"$PORT"; then
        cat <&3 >> "$RAW_LOG" &
        CAT_PID=$!

        echo -e "$CMD\r" >&3
        log "Exec Sent: $CMD"
        
        count=0
        timeout=30
        while [ "$count" -lt "$timeout" ]; do
            if busybox grep -qE "OK|ERROR" "$RAW_LOG"; then
                break
            fi
            sleep 1
            count=$((count + 1))
        done

        kill -9 "$CAT_PID" 2>/dev/null
        exec 3>&-
    fi

    rmdir "$LOCKDIR" 2>/dev/null

    DATA=$(cat "$RAW_LOG" | busybox tr '\n' ' ' | busybox tr '\r' ' ' | busybox sed 's/"/\\"/g')
    echo "{\"status\": \"done\", \"data\": \"$DATA\"}"
    exit 0
fi
