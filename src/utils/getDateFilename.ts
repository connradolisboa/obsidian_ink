
export function getDateFilename() {
    const date = new Date();

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());

    const hours24 = date.getHours();
    const suffix = hours24 < 12 ? 'am' : 'pm';
    // 0 and 12 both read as 12 on a 12 hour clock (midnight and midday).
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const minutes = pad(date.getMinutes());

    // Zero padded throughout so files sort chronologically in the file explorer,
    // where previously '2024.1.18' sorted after '2024.12.18'.
    return `${year}.${month}.${day} - ${pad(hours12)}.${minutes}${suffix}`;
}

function pad(value: number): string {
    return value.toString().padStart(2, '0');
}
