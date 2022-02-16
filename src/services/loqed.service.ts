import { BehaviorSubject, Observable } from 'rxjs';
import { LockState } from '../models/lock-state';
import { Logger } from 'homebridge';
import { LoqedStatus } from '../models/loqed-status.model';
import { LoqedWebhookStatus } from '../models/loqed-webhook-status.model';
import express from 'express';
import request from 'request';

export class LoqedService {
    public readonly lockStatus$: Observable<LoqedStatus | null>;

    private readonly lockStatusSubject: BehaviorSubject<LoqedStatus | null>;
    private server!: express.Application;

    private setStateUrl = 'https://gateway.production.loqed.com/v1/locks/{OLDLOCKID}/state?lock_api_key={APIKEY}&api_token={APITOKEN}&lock_state={STATE}&local_key_id=0';
    private getStateUrl = 'https://app.loqed.com/API/lock_status.php?api_token={APITOKEN}&lock_id={LOCKID}';

    private statusPollTimeout!: NodeJS.Timeout;

    constructor(
        private log: Logger,
        private apiKey: string,
        private apiToken: string,
        webhookPort: number | undefined,
        private oldLockId: number,
        private lockId: string,
    ) {
        this.lockStatusSubject = new BehaviorSubject<LoqedStatus | null>(null);
        this.lockStatus$ = this.lockStatusSubject.asObservable();

        if (webhookPort && !isNaN(webhookPort)) {
            this.enableWebhooks(webhookPort);
        }
    }

    public enableWebhooks(port: number): void {
        this.server = express();
        this.server.use(express.json());
        this.server.post('/webhook', (req, res) => {
            const loqedWebhookStatus = new LoqedWebhookStatus(req.body);
            if (loqedWebhookStatus.lock_id !== this.oldLockId || !this.lockStatusSubject.value) {
                return;
            }

            this.log.info('Received webhook request from', req.ip, req.hostname);
            this.log.info(req.body);

            const newStatus = new LoqedStatus(this.lockStatusSubject.value);
            newStatus.bolt_state = req.body.requested_state;

            this.lockStatusSubject.next(newStatus);

            res.status(200).send('OK');
        });

        this.server.listen(port, () => {
            this.log.info('Listening for webhook requests on port', port);
        });
    }

    public toggle(lockedState: LockState): Promise<void> {
        return this.changeState(lockedState === LockState.Unlocked ? 'DAY_LOCK' : 'NIGHT_LOCK');
    }

    public startPolling(frequencyInMinutes?: number): void {
        if (!frequencyInMinutes || frequencyInMinutes === 0) {
            return;
        }

        this.log.info('Started state polling every', frequencyInMinutes, 'minutes');

        if (this.statusPollTimeout) {
            clearTimeout(this.statusPollTimeout);
        }

        const continousLoop = true;

        setTimeout(async () => {
            while (continousLoop) {
                await this.getLoqedStatus();
                await this.sleep(frequencyInMinutes * 60 * 1000);
            }
        }, 0);
    }

    private async getLoqedStatus(): Promise<void> {
        const url = this.getStateUrl
            .replace('{APITOKEN}', this.apiToken)
            .replace('{LOCKID}', this.lockId);

        const loqedStatus = new LoqedStatus(await this.request<LoqedStatus>(url, 'GET'));

        this.lockStatusSubject.next(loqedStatus);
    }

    private async changeState(state: string): Promise<void> {
        const url = this.setStateUrl
            .replace('{OLDLOCKID}', this.oldLockId.toString())
            .replace('{APIKEY}', encodeURIComponent(this.apiKey))
            .replace('{APITOKEN}', encodeURIComponent(this.apiToken))
            .replace('{STATE}', state);

        await this.request(url, 'GET');
    }

    private async request<T>(url: string, method: string, params: unknown = null): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.log.debug('Loqed Request to', url);
            request({
                uri: url,
                method: method,
                body: params,
                json: true,
            }, (error, response, body) => {
                this.log.debug('Loqed Response', response.statusCode, body);

                if (!error && response.statusCode === 200) {
                    resolve(body);
                }
                else {
                    if (error) {
                        reject('Error while communicating with Loqed. Error: ' + error);
                    }
                    else if (response.statusCode !== 200) {
                        reject('Error while communicating with Loqed. Status Code: ' + response.statusCode);
                    }
                    else {
                        reject();
                    }
                }
            });
        });
    }

    private async sleep(milliSeconds: number) {
        return new Promise(resolve => setTimeout(resolve, milliSeconds));
    }
}