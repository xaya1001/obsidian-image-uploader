/*
 * @Author: Creling
 * @Date: 2021-07-15 23:54:03
 * @LastEditors: Creling
 * @LastEditTime: 2021-08-04 22:52:34
 * @Description: file content
 */
import {
    App,
    PluginSettingTab,
    Setting,
} from 'obsidian';

import ImageUploader from './main'

export default class ImageUploaderSettingTab extends PluginSettingTab {
    plugin: ImageUploader;
    private genericApiSettingsContainer: HTMLElement;
    private s3SettingsContainer: HTMLElement;
    
    constructor(app: App, plugin: ImageUploader) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl("h3", { text: "Image Uploader Setting" });

        // Uploader Service Type Dropdown
        new Setting(containerEl)
            .setName('Uploader Service Type')
            .setDesc('Select the type of service to upload images to.')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('Generic API', 'Generic API')
                    .addOption('S3 Compatible', 'S3 Compatible')
                    .setValue(this.plugin.settings.uploaderServiceType)
                    .onChange(async (value: 'Generic API' | 'S3 Compatible') => {
                        this.plugin.settings.uploaderServiceType = value;
                        await this.plugin.saveSettings();
                        this.updateDisplayedSettings();
                    });
            });

        // Container for Generic API Settings
        this.genericApiSettingsContainer = containerEl.createDiv('generic-api-settings');
        // Container for S3 Compatible Settings
        this.s3SettingsContainer = containerEl.createDiv('s3-settings');

        this.addGenericApiSettings(this.genericApiSettingsContainer);
        this.addS3Settings(this.s3SettingsContainer);

        this.updateDisplayedSettings(); // Initial call to show/hide based on current settings
            
        // Common settings
        new Setting(containerEl)
            .setName("Enable Resize")
            .setDesc("Resize the image before uploading")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.enableResize)
                    .onChange(async (value) => {
                        this.plugin.settings.enableResize = value;
                        this.display();
                    })
            })

        if (this.plugin.settings.enableResize) {
            new Setting(containerEl)
                .setName("Max Width")
                .setDesc("The image wider than this will be resized by the natural aspect ratio")
                .addText((text) => {
                    text
                        .setPlaceholder("")
                        .setValue(this.plugin.settings.maxWidth.toString())
                        .onChange(async (value) => {
                            this.plugin.settings.maxWidth = parseInt(value);
                            await this.plugin.saveSettings();
                        })
                });
        }
    }
    
    private updateDisplayedSettings(): void {
        if (this.plugin.settings.uploaderServiceType === 'S3 Compatible') {
            this.genericApiSettingsContainer.style.display = 'none';
            this.s3SettingsContainer.style.display = 'block';
        } else { // 'Generic API'
            this.genericApiSettingsContainer.style.display = 'block';
            this.s3SettingsContainer.style.display = 'none';
        }
    }

    private addGenericApiSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName("Api Endpoint")
            .setDesc("The endpoint of the image hosting api.")
            .addText((text) => {
                text
                    .setPlaceholder("")
                    .setValue(this.plugin.settings.apiEndpoint)
                    .onChange(async (value) => {
                        this.plugin.settings.apiEndpoint = value;
                        await this.plugin.saveSettings();
                    })
            }
        );

        new Setting(containerEl)
            .setName("Upload Header")
            .setDesc("The header of upload request in json format.")
            .addTextArea((text) => {
                text
                    .setPlaceholder("")
                    .setValue(this.plugin.settings.uploadHeader)
                    .onChange(async (value) => {
                        try {
                            this.plugin.settings.uploadHeader = value;
                            await this.plugin.saveSettings();
                        }
                        catch (e) {
                            console.log(e)
                        }
                    })
                text.inputEl.rows = 5
                text.inputEl.cols = 40
            }
        );

        new Setting(containerEl)
            .setName("Upload Body")
            .setDesc("The body of upload request in json format. Do NOT change it unless you know what you are doing.")
            .addTextArea((text) => {
                text
                    .setPlaceholder("")
                    .setValue(this.plugin.settings.uploadBody)
                    .onChange(async (value) => {
                        try {
                            this.plugin.settings.uploadBody = value;
                            await this.plugin.saveSettings();
                        }
                        catch (e) {
                            console.log(e)
                        }
                    })
                text.inputEl.rows = 5
                text.inputEl.cols = 40
            }
        );

        new Setting(containerEl)
            .setName("Image Url Path")
            .setDesc("The path to the image url in http response.")
            .addText((text) => {
                text
                    .setPlaceholder("")
                    .setValue(this.plugin.settings.imageUrlPath)
                    .onChange(async (value) => {
                        this.plugin.settings.imageUrlPath = value;
                        await this.plugin.saveSettings();
                    })
            }
        );
    }

    private addS3Settings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'S3 Compatible Service Settings' });

        new Setting(containerEl)
            .setName('S3 Access Key ID')
            .setDesc('Enter your S3 Access Key ID.')
            .addText((text) => {
                text
                    .setPlaceholder('Access Key ID')
                    .setValue(this.plugin.settings.s3AccessKeyId)
                    .onChange(async (value) => {
                        this.plugin.settings.s3AccessKeyId = value;
                        await this.plugin.saveSettings();
                    })
                }
            );

        new Setting(containerEl)
            .setName('S3 Secret Access Key')
            .setDesc('Enter your S3 Secret Access Key.')
            .addText((text) => {
                text
                    .setPlaceholder('Secret Access Key')
                    .setValue(this.plugin.settings.s3SecretAccessKey)
                    .onChange(async (value) => {
                        this.plugin.settings.s3SecretAccessKey = value;
                        await this.plugin.saveSettings();
                    })
                }
            );

        new Setting(containerEl)
            .setName('S3 Bucket Name')
            .setDesc('Enter your S3 Bucket name.')
            .addText((text) => {                    
                text
                    .setPlaceholder('Bucket Name')
                    .setValue(this.plugin.settings.s3BucketName)
                    .onChange(async (value) => {
                        this.plugin.settings.s3BucketName = value;
                        await this.plugin.saveSettings();
                    })
                }
            );

        new Setting(containerEl)
            .setName('S3 Region')
            .setDesc('Enter the S3 region (e.g., us-east-1, auto for Cloudflare R2).')
            .addText((text) => {
                text
                    .setPlaceholder('us-east-1 or auto')
                    .setValue(this.plugin.settings.s3Region)
                    .onChange(async (value) => {
                        this.plugin.settings.s3Region = value;
                        await this.plugin.saveSettings();
                    })
                }
            );

        new Setting(containerEl)
            .setName('S3 Endpoint (Optional)')
            .setDesc('Enter the custom S3 endpoint URL (e.g., for Cloudflare R2, MinIO). Leave empty for AWS S3 default.')
            .addText((text) => {
                text
                    .setPlaceholder('https://<ACCOUNT_ID>.r2.cloudflarestorage.com')
                    .setValue(this.plugin.settings.s3Endpoint || '')
                    .onChange(async (value) => {
                        this.plugin.settings.s3Endpoint = value;
                        await this.plugin.saveSettings();
                    })
                }
            );
        
        new Setting(containerEl)
            .setName('S3 Path Prefix (Optional)')
            .setDesc('Enter a path prefix to upload files into a specific folder within the bucket (e.g., images or blog/images).')
            .addText((text) => {
                text
                    .setPlaceholder('images')
                    .setValue(this.plugin.settings.s3PathPrefix || '')
                    .onChange(async (value) => {
                        this.plugin.settings.s3PathPrefix = value;
                        await this.plugin.saveSettings();
                    })
                }
            );

        new Setting(containerEl)
            .setName('S3 Public URL Base (Optional)')
            .setDesc('Base URL for constructing the public image URL (e.g., for custom domains on R2/S3 or CDNs). Example: https://my-cdn.com (no trailing slash). If empty, a standard URL will be attempted.')
            .addText((text) => {
                text
                    .setPlaceholder('https://your-custom-domain.com')
                    .setValue(this.plugin.settings.s3PublicUrlBase || '')
                    .onChange(async (value) => {
                        this.plugin.settings.s3PublicUrlBase = value;
                        await this.plugin.saveSettings();
                    })
                }
            );

        new Setting(containerEl)
            .setName('S3 Force Path Style (Optional)')
            .setDesc('Enable if your S3-compatible service requires path-style access (e.g., http://endpoint/bucket/key). Default is virtual-hosted style.')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.s3ForcePathStyle || false)
                    .onChange(async (value) => {
                        this.plugin.settings.s3ForcePathStyle = value;
                        await this.plugin.saveSettings();
                    })
                }
            );
    }
}