<div align="center">
  
![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Ant Design](https://img.shields.io/badge/Ant%20Design-0170FE?style=for-the-badge&logo=ant-design&logoColor=white)

</div>

# MediaMagic

A desktop application for efficient media file conversion, supporting various formats of video, audio, and images.

<div align="center">
  <img src="./assets/new_output.gif" alt="Description of GIF" />
</div>

## Status

⚠️ Currently available in development mode only due to ongoing integration issues with FFmpeg binaries in the production build.
⚠️ A white screen might sometimes be opened with the main app for no reason. Since the issue is not consistent I was unable to solve it.

## Platform Support

- ✅ Windows: Fully tested and supported
- ⚡ Linux/MacOS: Not yet tested

## Prerequisites

1. FFmpeg installation required:

- Using Chocolatey (Windows):
  ```bash
  choco install ffmpeg
  ```
- Or download directly from [FFmpeg official website](https://ffmpeg.org/download.html)

## Development Setup

1. Clone the repository:

```bash
git clone https://github.com/allhailalona/MediaMagic.git
```

2. Install dependencies

```bash
npm install
```

3. Run in Devlopment mode

```bash
npm run dev
```

Or in Preview mode

```bash
npm start
```

## **FFmpeg Binaries Path Resolution Issue**

## FFmpeg Integration Approaches

### Initial Manual Approach

Attempted direct FFmpeg binary integration through electron-builder configuration:

```json
{
  "build": {
    "files": ["out/**/*", "resources/**/*"],
    "extraResources": [
      {
        "from": "./resources/bin/",
        "to": "bin/",
        "filter": ["**/*"]
      }
    ]
  }
}
```

Path resolution was handled in the main process:

```typescript
const getFFmpegPath = () => {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ffmpeg.exe')
    : path.join(app.getAppPath(), 'resources', 'bin', 'ffmpeg.exe')
}
```

Unfortunately that did not work, the built app couldn't perform any ffmpeg ops

### NPM Package Approach

Attempted using `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe`:

```typescript
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobePathFixed)
```

While this resolved the path issues, the provided FFmpeg build (v6.0) lacked AVIF encoding support required for optimal image compression. The package's FFmpeg version trailed behind the latest release (7.1), limiting access to newer codecs.
