# stepcord

StepCord is a smart USB-C Power Delivery ecosystem designed for musical instruments and stage rigs. It automatically detects and configures the correct voltage and current for each connected device by querying a database of thousands of equipment profiles, eliminating the need for multiple dedicated power adapters. Built around the AP33772S PD controller and a Waveshare RP2350 platform, StepCord prioritizes plug-and-play simplicity, high energy efficiency, and low electrical noise — turning a single smart cable/hub into a universal, auto-configuring power source for synths, pedals, and other gear.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://stepcord.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9b9c2f72-ac50-4ef8-9431-a2a5c556edbc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
