import { describe, expect, jest, test } from "@jest/globals";
import { getDateFilename } from "./getDateFilename";

////////////
////////////

describe(`Get formatted date filename`, () => {

    jest.useFakeTimers();

    test(`Morning`, () => {
        jest.setSystemTime(new Date('Jan 18 2024 09:05:59'));
        const result = getDateFilename();
        expect(result).toEqual('2024.01.18 - 09.05am');
    })

    test(`Midday`, () => {
        jest.setSystemTime(new Date('Jan 18 2024 12:00:00'));
        const result = getDateFilename();
        expect(result).toEqual('2024.01.18 - 12.00pm');
    })

    test(`Evening`, () => {
        jest.setSystemTime(new Date('Jan 18 2024 23:10:10'));
        const result = getDateFilename();
        expect(result).toEqual('2024.01.18 - 11.10pm');
    })

    test(`Midnight`, () => {
        jest.setSystemTime(new Date('Jan 18 2024 00:30:00'));
        const result = getDateFilename();
        expect(result).toEqual('2024.01.18 - 12.30am');
    })

    test(`Zero padding keeps names in chronological order`, () => {
        jest.setSystemTime(new Date('Jan 18 2024 09:05:00'));
        const january = getDateFilename();
        jest.setSystemTime(new Date('Dec 18 2024 09:05:00'));
        const december = getDateFilename();
        expect(january < december).toBe(true);
    })

});
