import Yakamoz from '../dist/yakamoz.js';
import { Parser } from 'm3u8-parser';
import muxjs from 'mux.js';

(async () => {
    //You can change these parts or you can connect it to indexedDB if you want!
    const baseURL = `https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism`;

    const m3u8File = `/tears-of-steel-audio_eng=128002-video_eng=1001000.m3u8`;
    const parser = new Parser();

    //fetching and parsing our m3u8 manifest
    async function fetchAndParseM3U8() {
        const f = await fetch(baseURL + m3u8File);
        const resp = await f.text();
        parser.push(resp);
        parser.end();
        return parser.manifest.segments;
    }

    const parsedSegments = await fetchAndParseM3U8();

    const request = (url) => fetch(url).then((response) => response.arrayBuffer());

    //Create an fMp4 transmuxer to convert mp2t buffers to fragmented mp4 buffers
    let transmuxer = new muxjs.mp4.Transmuxer();
    async function transmux(chunk, giveAsSourceBuffer) {
        return new Promise((resolve) => {
            transmuxer.off('data');
            transmuxer.on('data', (segment) => {
                if (giveAsSourceBuffer) {
                    let data = new Uint8Array(
                        segment.initSegment.byteLength + segment.data.byteLength,
                    );
                    data.set(segment.initSegment, 0);
                    data.set(segment.data, segment.initSegment.byteLength);
                    resolve(data.buffer);
                } else {
                    resolve(segment.data.buffer);
                }
            });

            transmuxer.push(new Uint8Array(chunk));
            transmuxer.flush();
        });
    }

    const yakamoz = new Yakamoz();

    //append the first buffer
    yakamoz.addEventListener('NEED_SOURCEBUFFER', async (e) => {
        const { append } = e.detail;
        const getNewBuffer = await request(`${baseURL}/${parsedSegments[0].uri}`);
        const buffer = await transmux(getNewBuffer, true);
        append(buffer);
    });

    //append proper segments when needed
    yakamoz.addEventListener('NEW_SEGMENT', async (e) => {
        const { append, targetSegment } = e.detail;
        const getNewBuffer = await request(`${baseURL}/${parsedSegments[targetSegment].uri}`);
        const buffer = await transmux(getNewBuffer);
        append(buffer);
    });

    //Do not forget to create a video element and mime property should match with the playing video.
    yakamoz.init({
        video: document.querySelector('video'),
        segments: parsedSegments,
        mime: 'video/mp4; codecs="avc1.640028,mp4a.40.2"; profiles="isom,iso2,avc1,mp41""',
    });

    //No need to clear unnecessary buffers. Yakamoz will clear them by default 😉
})();
