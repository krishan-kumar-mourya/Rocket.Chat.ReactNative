const { navigateToLogin, login, sleep } = require('../../helpers/app');
const data = require('../../data');

const testuser = data.users.regular;

async function waitForToast() {
	await sleep(300);
}

describe('Status screen', () => {
	before(async () => {
		await device.launchApp({ permissions: { notifications: 'YES' }, delete: true });
		await navigateToLogin();
		await login(testuser.username, testuser.password);

		await element(by.id('rooms-list-view-sidebar')).tap();
		await waitFor(element(by.id('sidebar-view')))
			.toBeVisible()
			.withTimeout(2000);
		await waitFor(element(by.id('sidebar-custom-status')))
			.toBeVisible()
			.withTimeout(2000);

		await element(by.id('sidebar-custom-status')).tap();
		await waitFor(element(by.id('status-view')))
			.toBeVisible()
			.withTimeout(2000);
	});

	describe('Render', () => {
		it('should have status input', async () => {
			await expect(element(by.id('status-view-input'))).toBeVisible();
			await expect(element(by.id('status-view-online'))).toExist();
			await expect(element(by.id('status-view-busy'))).toExist();
			await expect(element(by.id('status-view-away'))).toExist();
			await expect(element(by.id('status-view-offline'))).toExist();
		});
	});

	describe('Usage', () => {
		it('should change status', async () => {
			await element(by.id('status-view-busy')).tap();
			await waitFor(element(by.id('status-view-current-busy')))
				.toExist()
				.withTimeout(2000);
		});

		// TODO: flaky
		it('should change status text', async () => {
			await element(by.id('status-view-input')).replaceText('status-text-new');
			await element(by.id('status-view-submit')).tap();
			await waitForToast();
			await waitFor(element(by.label('status-text-new').withAncestor(by.id('sidebar-custom-status'))))
				.toExist()
				.withTimeout(2000);
		});
	});
});
