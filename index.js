import {promisify} from 'util';

import Multipart from 'multi-part';
import got from 'got';
import toughCookie from 'tough-cookie';

export {Multipart};
export const {CookieJar} = toughCookie;

export class TAPContextGot {
	httpError = {
		400: /Response code 400/u,
		404: /Response code 404/u,
		405: /Response code 405/u
	};

	genericGotOptions = {
		cache: new Map(),
		timeout: 10000,
		cookieJar: new CookieJar()
	};

	get baseURL() {
		return this.integrationInstance.baseURL;
	}

	constructor(integrationInstance) {
		this.integrationInstance = integrationInstance;
	}

	async getCookieString(url) {
		const {cookieJar} = this.genericGotOptions;
		return promisify(cookieJar.getCookieString.bind(cookieJar))(url);
	}

	api(api, options) {
		return got(`${this.baseURL}${api}`, {
			...this.genericGotOptions,
			...options
		});
	}

	async json(api, options) {
		const {body} = await this.api(api, options);

		return JSON.parse(body);
	}

	async post(api, options) {
		const {cache} = options;
		options = {
			headers: {},
			...this.genericGotOptions,
			...options
		};

		if (!cache) {
			delete options.cache;
		}

		if (typeof options.body === 'function') {
			options.body = options.body();
		}

		if (options.body instanceof Multipart) {
			const data = options.body;
			options.body = await data.buffer();
			options.headers = {
				...data.getHeaders(false),
				...options.headers
			};
		} else if (options.json !== false) {
			options.body = JSON.stringify(options.body);
			options.headers = {
				'Content-Type': 'application/json',
				...options.headers
			};
		}

		const {body} = await got.post(`${this.baseURL}${api}`, options);

		return JSON.parse(body);
	}

	static setup(tap, integrationInstance) {
		const {Test} = tap;

		Test.addAssert('checkGet', 2, async function (api, expected, message, extra) {
			try {
				this.strictSame(await this.context.json(api), expected, message || api, extra);
			} catch (error) {
				this.error(error, message || api, extra);
			}
		});
		Test.addAssert('matchGet', 2, async function (api, expected, message, extra) {
			try {
				this.match(await this.context.json(api), expected, message || api, extra);
			} catch (error) {
				this.error(error, message || api, extra);
			}
		});
		Test.addAssert('checkGetError', 2, async function (api, error, message, extra) {
			await this.rejects(
				this.context.json(api),
				this.context.httpError[error],
				message || `GET ${api}`,
				extra
			);
		});

		Test.addAssert('checkPost', 3, async function (api, body, expected, message, extra) {
			try {
				this.strictSame(await this.context.post(api, {body}), expected, message || api, extra);
			} catch (error) {
				this.error(error, message || api, extra);
			}
		});
		Test.addAssert('checkPostError', 3, async function (api, body, error, message, extra) {
			await this.rejects(
				this.context.post(api, {body}),
				this.context.httpError[error],
				message || `POST ${api}`,
				extra
			);
		});

		tap.test('setup integration testing', async () => {
			const context = new this(integrationInstance);
			await integrationInstance.start?.();

			tap.beforeEach((done, t) => {
				t.context = context;
				done();
			});

			tap.teardown(async () => {
				await integrationInstance.stop?.();
				await integrationInstance.checkStopped?.();
			});
		});
	}
}
