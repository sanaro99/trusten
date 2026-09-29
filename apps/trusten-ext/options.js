const form = document.getElementById('settingsForm')
const message = document.getElementById('message')

loadTrustenSettings()
  .then((settings) => {
    document.getElementById('serverOrigin').value = settings.serverOrigin
    document.getElementById('dashboardOrigin').value = settings.dashboardOrigin
  })
  .catch((error) => {
    message.textContent = error.message
  })

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    const settings = {
      serverOrigin: trustenOrigin(
        document.getElementById('serverOrigin').value.trim(),
      ),
      dashboardOrigin: trustenOrigin(
        document.getElementById('dashboardOrigin').value.trim(),
      ),
    }
    // Request access to this chosen service, within the user's save gesture.
    const granted = await chrome.permissions.request({
      origins: [`${settings.serverOrigin}/*`],
    })
    if (!granted)
      throw new Error(
        'Allow access to the chosen Trusten service to save this connection.',
      )
    await chrome.storage.local.set(settings)
    message.textContent =
      'Connection saved. Reopen the Trusten popup to check a page.'
  } catch (error) {
    message.textContent = error.message || 'Could not save this connection.'
  }
})
