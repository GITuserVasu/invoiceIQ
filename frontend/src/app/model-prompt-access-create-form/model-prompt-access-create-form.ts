// @ts-nocheck
import { AfterViewInit, Component, ViewEncapsulation } from '@angular/core';
import { initTopBar } from '../shared/topbar';

@Component({
  selector: 'app-model-prompt-access',
  standalone: true,
  imports: [],
  templateUrl: './model-prompt-access-create-form.html',
  styleUrl: './model-prompt-access-create-form.css',
  encapsulation: ViewEncapsulation.None
})
export class ModelPromptAccessComponent implements AfterViewInit {
  ngAfterViewInit(): void {
    initTopBar();

    var nameInput = document.getElementById('modelName') as HTMLInputElement;
    var keyInput = document.getElementById('modelKey') as HTMLInputElement;
    if (nameInput && keyInput) {
      nameInput.addEventListener('input', function() {
        keyInput.value = nameInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      });
    }

    var tempSlider = document.getElementById('temperature') as HTMLInputElement;
    var tempVal = document.getElementById('temperatureVal');
    if (tempSlider && tempVal) {
      tempSlider.addEventListener('input', function() { tempVal.textContent = tempSlider.value; });
    }

    var submitBtn = document.getElementById('submitModelBtn');
    var status = document.getElementById('modelCreateStatus');
    if (submitBtn && status) {
      submitBtn.addEventListener('click', function() {
        var name = nameInput ? nameInput.value.trim() : '';
        if (!name) { status.textContent = 'Model name is required.'; status.className = 'mpa-status error'; return; }
        status.textContent = 'Model "' + name + '" created. Go to Models & Quality to assign it to an entity.';
        status.className = 'mpa-status ok';
      });
    }
  }
}
