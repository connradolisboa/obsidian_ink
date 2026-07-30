# Ink Custom
A personal fork of the [Ink](https://github.com/daledesilva/obsidian_ink) plugin for [Obsidian](https://obsidian.md), maintained independently under its own plugin ID (`ink-custom`) so it no longer collides with the original plugin's updates. Forked and improved for using it with Onyx Boox devices — I recommend using https://github.com/sergeylappo/boox-rapid-draw with the plugin.

Hand write or draw directly between paragraphs in your notes using a digital pen, stylus, or Apple pencil. Useful for handwriting, sketches, scribbles, or even math equations and scientific notation. Runs on the tldraw framework and drawing provides an infinite canvas.

## ⚠️ Known Issues - v0.3.5
**Notebooks feature is not fully working.** The multi-page notebook functionality has reliability issues and may not work as expected. If you encounter problems with notebooks, please consider using single-page writing embeds as a workaround. Updates to address this are in development.

## 🎥 Demo
<p align="center">
  <a href="https://www.youtube.com/watch?v=qgir8F7ezNM" target="_blank">
      <img src="https://img.youtube.com/vi/qgir8F7ezNM/0.jpg" width="60%" alt="Screenshot of devdiary video"><br/>
      Click to play demo
  </a>

</p>

**Demo Note**<br/>
In the video above, I have set up this plugin's commands to be visible in another plugin called [Slash Commander](https://github.com/alephpiece/obsidian-slash-commander) - This allows me to select the insert command quickly by simply typing `/`.

## 🗺️ Rough roadmap
I've been building this plugin since December 2023 and I'm currently developing it further and using it daily.<br/>
Below are the high level features in my current development plan along with their expected timeframes.

<details>
<summary>Historical</summary>

- [x] Proof of concept handwriting input.
- [x] Proof of concept drawing input.
- [x] Embeddable in markdown files.
- [x] Automatic screenshotting.
- [x] Proof of concept OCR (Transcripts).
- [x] Refined UI.
</details>

<details open>
<summary>Current feature focus</summary>

- [ ] Fix notebook multi-page functionality and reliability issues.
- [ ] Ability to reframe embedded drawings.
- [ ] Pen smoothing enhancements.
- [ ] Support for e-ink devices (Onyx Boox and similar).
</details>

<details>
<summary>Speculative</summary>

- [ ] Convert embed format to persist beyond uninstall.
- [ ] Separate touch interactions.
- [ ] Multiple pen styles.
- [ ] Automatic OCR (Transcripts).
- [ ] Writing edit interactions.
</details>

## ⚠️ Be careful
>This is a personal fork, provided 'as is'. There are always chances things might not work quite right. To be safe, **please always back up your files**.

## 🪳 Report a bug
Found something that's not quite working right or do you have a feature request? Open an issue on this fork's [GitHub Issues](https://github.com/connradolisboa/obsidian_ink/issues) page.

## 💾 Installation
This fork is not published in Obsidian's Community Plugins directory. It's installed manually (or via BRAT) under the plugin ID `ink-custom`, which keeps it fully independent from the original `ink` plugin — both can coexist without update conflicts.
<details>
<summary>Click for Beta version installation instructions via BRAT</summary>

1. Open your Obsidian vault and go to **Settings**.
2. Click on **Community Plugins** in the side bar.
3. Turn on community plugins and click **Browse**.
4. Search and install **BRAT**.
5. Scroll down and **activate** BRAT.
6. In the BRAT menu in the side pane, select **Add Beta Plugin**.
7. Follow the instructions presented.
8. When a URL is requested, use: `https://github.com/connradolisboa/obsidian_ink`

</details>
<details>
<summary>Click for Beta version update instructions</summary>

- BRAT is set to update Beta plugins by default on startup, however, this can sometimes take some time.
- To force an update, run BRAT's Obsidian commnd `Choose a single plugin to update` and choose Ink Custom.
</details>

## 🏛️ License
>This fork is based on the original [Ink](https://github.com/daledesilva/obsidian_ink) plugin by Dale de Silva, which is licensed under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) — modification for personal use is permitted, but the license does not permit distributing derivative works. This fork is kept for personal, non-commercial use.

## 🗒️ Notes

#### Optimisation Notes
The plugin currently works based on the [tldraw](https://tldraw.dev/) framework, however, tldraw is implemented using SVG elements which slow down greatly on iOS platforms and possibly others. This equates to significant lag while writing after about 200-300 strokes on iOS (Which is about 3-4 paragraphs). To temporarily mitigate this, the plugin hides strokes while writing that are several lines old. The strokes are still saved and reappear upon freezing the embed, reopening the file, or adjusting the infinite canvas view.

In the future, this plugin will transition off tldraw (at least for writing functionality), to Canvas based input. When this occurs any files that users have created will be converted automatically if necessary—You can count on this as I already have many files in my own vaults that rely on this plugin.

#### Embed Format Notes
The embed implementation is currently based on a code block that tells the plugin how to display the embed. I'm not happy with this, however, as it means if anyone ever wants to transition off this plugin they have to keep it installed in order to see their old handwritten sections.

I will be modifying this to simply be an image embed that the plugin recognises and enhances. This will mean that even if you uninstall the plugin, all your embeds will still be visible as static images.

#### Drawing Functionality Notes
There's currently 2 file formats that the plugin implements as embeddable sections. A handwriting file, and a drawing file. This enables the plugin to aid the user in different ways and provide more intuitive UIs for each input mode. The drawing file, however, while I have found that I already prefer using it over other Obsidian plugins, is not the primary goal of this plugin at this stage. It should therefore be treated with caution regarding future support.

Note, however, that the embed format described above will apply here also, which means your exist drawings will still remain visible as static images even if support is removed.

Note also that the drawing functionality will not take the place of Excalidraw. Excalidraw provides a feature rich ability to diagram holistically, whereas this plugin is built around freeform natural pen input. I personally like sketching more freeform with only minimal aid of drag and drop elements, so this is what drawing here is focussed on as that aligns with a handwritten style of taking notes as well.

## ❤️ Credit
The original **Ink** plugin was created by Dale de Silva — [designdebt.club](https://designdebt.club). If you'd like to support that work directly, see the original repo: [github.com/daledesilva/obsidian_ink](https://github.com/daledesilva/obsidian_ink).
