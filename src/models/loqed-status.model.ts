import { LockState } from './lock-state';

export class LoqedStatus {
    id!: string;
    battery_percentage!: number;
    battery_type!: number;
    bolt_state!: string;
    guest_access_mode!: number;
    twist_assist!: number;
    touch_to_connect!: number;
    lock_direction!: number;
    bolt_state_numeric!: number;

    constructor(init?: Partial<LoqedStatus>) {
        if (init) {
            Object.assign(this, init);
        }
    }

    get state(): LockState {
        switch (this.bolt_state.toLowerCase()) {
            case 'day_lock':
                return LockState.Unlocked;
            case 'night_lock':
                return LockState.Locked;
            default:
                return LockState.Unknown;
        }
    }
}