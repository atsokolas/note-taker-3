import axios from 'axios';

test('Axios enforces maxContentLength before decoding a data URL', async () => {
  await expect(axios.get('data:text/plain;base64,aGVsbG8gd29ybGQ=', {
    adapter: 'http',
    maxContentLength: 4
  })).rejects.toThrow(/maxContentLength/);
});
