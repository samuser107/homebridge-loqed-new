export class Lock {
    name!: string;
    oldLockId!: number;
    lockId!: string;
    statePollingFrequencyInMinutes?: number;

    constructor(init?: Partial<Lock>) {
        if (init) {
            Object.assign(this, init);
        }
    }
}