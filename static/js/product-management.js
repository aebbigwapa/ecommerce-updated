document.addEventListener('DOMContentLoaded', function() {
  // Product form functionality
  const formSteps = document.querySelectorAll('.form-step');
  const stepIndicators = document.querySelectorAll('.step');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const submitBtn = document.getElementById('submitBtn');
  const form = document.getElementById('addProductForm');
  let currentStep = 1;
  
  // Separate size and color management
  let sizePills = document.querySelectorAll('.size-pill');
  const presetColorBtns = document.querySelectorAll('.preset-color-btn');
  const addCustomColorBtn = document.getElementById('addCustomColorBtn');
  const customColorName = document.getElementById('customColorName');
  const customColorPicker = document.getElementById('customColorPicker');
  
  const colorsConfigGrid = document.getElementById('colorsConfigGrid');
  const clothingSizesContainer = document.getElementById('clothingSizes');
  const shoeSizesContainer = document.getElementById('shoeSizes');
  const customShoeSizeInput = document.getElementById('customShoeSizeInput');
  const customShoeSizeField = document.getElementById('customShoeSize');
  const addCustomShoeSizeBtn = document.getElementById('addCustomShoeSizeBtn');
  
  // Data storage
  const selectedSizes = new Set();
  const customShoeSizes = new Set(); // Track custom sizes to avoid duplicates
  const selectedColors = new Map(); // color hex -> {name, hex}
  const colorConfigs = {}; // color -> {name, images}
  let variantMatrix = {}; // size_color -> {size, color, colorName, price, discountPrice, stock, colorImages}
  
  // Toast notification function
  function showToast(message, type = 'info') {
    const colors = {
      success: '#28a745',
      error: '#dc3545', 
      info: '#007bff'
    };
    
    const toast = document.createElement('div');
    toast.className = 'toast align-items-center text-white';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      min-width: 250px;
      z-index: 1055;
      background: ${colors[type]};
      border-radius: 8px;
      padding: 10px 15px;
      margin-bottom: 10px;
    `;
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.parentElement.parentElement.remove()"></button>
      </div>
    `;
    const style = document.createElement('style');
    style.textContent = `
        .is-invalid {
            border-color: #dc3545 !important;
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' width='12' height='12' fill='none' stroke='%23dc3545'%3e%3ccircle cx='6' cy='6' r='4.5'/%3e%3cpath stroke-linejoin='round' d='M5.8 3.6h.4L6 6.5z'/%3e%3ccircle cx='6' cy='8.2' r='.6' fill='%23dc3545' stroke='none'/%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right calc(0.375em + 0.1875rem) center;
            background-size: calc(0.75em + 0.375rem) calc(0.75em + 0.375rem);
        }
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 4000);
  }

  // Validation helpers
  function validatePrice(originalPrice, discountPrice) {
    if (discountPrice && parseFloat(discountPrice) >= parseFloat(originalPrice)) {
      return false;
    }
    return true;
  }

  function calculateDiscountPercentage(originalPrice, discountPrice) {
    if (!discountPrice || !originalPrice) return 0;
    return Math.round(((originalPrice - discountPrice) / originalPrice) * 100);
  }
  
  // Default images management
  let defaultImagesFiles = [];

  // Initialize form
  initProductForm();
  
function initProductForm() {
    // Load seller's registered category from their registration
    const categorySelect = document.getElementById('productCategory') || document.querySelector('select[name="category"]');
    (async () => {
      try {
        if (categorySelect) {
          // Wait for AuthManager to be available
          let retries = 0;
          while (typeof AuthManager === 'undefined' && retries < 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
          }
          
          // Get auth token
          let token = null;
          if (typeof AuthManager !== 'undefined' && AuthManager.isLoggedIn()) {
            token = AuthManager.getAuthToken();
          } else {
            token = localStorage.getItem('auth_token');
          }
          
          if (!token) {
            throw new Error('Authentication token not found');
          }
          
          // Fetch seller's registered category
          const res = await fetch('/api/seller/category', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to load category');
          }
          
          const data = await res.json();
          
          if (data.success && data.categories && data.categories.length > 0) {
            // Clear loading message
            categorySelect.innerHTML = '';
            
            // Add the seller's registered category(ies)
            data.categories.forEach(category => {
              const opt = document.createElement('option');
              opt.value = category;
              opt.textContent = category;
              categorySelect.appendChild(opt);
            });
            
            // If there's only one category, select it by default
            if (data.categories.length === 1) {
              categorySelect.value = data.categories[0];
              // Update size options based on initial category
              updateSizeOptionsForCategory(categorySelect.value);
            }
            
            console.log('Category loaded successfully:', data.categories);
          } else {
            throw new Error('No category found');
          }
        }
      } catch (e) {
        console.error('Error loading seller category:', e);
        if (categorySelect) {
          categorySelect.innerHTML = '<option value="">Error loading category</option>';
          
          // Show error message to user
          const errorMsg = document.createElement('div');
          errorMsg.className = 'alert alert-danger mt-2';
          errorMsg.textContent = `Failed to load your registered category: ${e.message}. Please contact support.`;
          categorySelect.parentElement.appendChild(errorMsg);
        }
      }
    })();

    // Category change handler to switch size options
    if (categorySelect) {
      categorySelect.addEventListener('change', function() {
        updateSizeOptionsForCategory(this.value);
      });
    }

    // Function to update size options based on category
    function updateSizeOptionsForCategory(category) {
      // Clear all selected sizes when switching categories
      selectedSizes.clear();
      customShoeSizes.clear();
      variantMatrix = {};
      
      // Remove selected class from all size pills
      document.querySelectorAll('.size-pill').forEach(pill => {
        pill.classList.remove('selected');
      });
      
      // Remove any custom shoe size pills
      if (shoeSizesContainer) {
        const customPills = shoeSizesContainer.querySelectorAll('.size-pill.custom-size');
        customPills.forEach(pill => pill.remove());
      }
      
      // Show/hide appropriate size containers
      if (category === 'Shoes & Accessories') {
        if (clothingSizesContainer) clothingSizesContainer.style.display = 'none';
        if (shoeSizesContainer) shoeSizesContainer.style.display = 'flex';
        if (customShoeSizeInput) customShoeSizeInput.style.display = 'block';
        // Update sizePills to reference shoe sizes
        sizePills = shoeSizesContainer ? shoeSizesContainer.querySelectorAll('.size-pill') : [];
      } else {
        if (clothingSizesContainer) clothingSizesContainer.style.display = 'flex';
        if (shoeSizesContainer) shoeSizesContainer.style.display = 'none';
        if (customShoeSizeInput) customShoeSizeInput.style.display = 'none';
        // Update sizePills to reference clothing sizes
        sizePills = clothingSizesContainer ? clothingSizesContainer.querySelectorAll('.size-pill') : [];
      }
      
      // Re-attach event listeners to the new size pills
      attachSizePillListeners();
      
      // Update variant matrix display
      updateVariantMatrix();
    }
    
    // Function to add custom shoe size
    function addCustomShoeSize() {
      if (!customShoeSizeField || !shoeSizesContainer) return;
      
      const sizeValue = customShoeSizeField.value.trim();
      if (!sizeValue) {
        showToast('Please enter a size', 'error');
        return;
      }
      
      // Validate it's a valid number
      const sizeNum = parseFloat(sizeValue);
      if (isNaN(sizeNum) || sizeNum < 20 || sizeNum > 60) {
        showToast('Please enter a valid size between 20 and 60', 'error');
        return;
      }
      
      // Check if size already exists
      const sizeStr = sizeNum.toString();
      if (customShoeSizes.has(sizeStr) || selectedSizes.has(sizeStr)) {
        showToast('This size is already added', 'error');
        return;
      }
      
      // Create new size pill
      const newPill = document.createElement('div');
      newPill.className = 'size-pill custom-size';
      newPill.setAttribute('data-size', sizeStr);
      newPill.textContent = sizeStr;
      
      // Add to container (after standard sizes)
      shoeSizesContainer.appendChild(newPill);
      
      // Add to tracking sets
      customShoeSizes.add(sizeStr);
      selectedSizes.add(sizeStr);
      newPill.classList.add('selected');
      
      // Clear input
      customShoeSizeField.value = '';
      
      // Re-attach listeners to include the new pill
      attachSizePillListeners();
      
      // Update variant matrix
      updateVariantMatrix();
      
      showToast(`Size ${sizeStr} added`, 'success');
    }
    
    // Function to attach event listeners to size pills
    function attachSizePillListeners() {
      sizePills.forEach(pill => {
        // Remove any existing listeners by cloning
        const newPill = pill.cloneNode(true);
        pill.parentNode.replaceChild(newPill, pill);
        
        // Add click listener
        newPill.addEventListener('click', () => {
          const size = newPill.getAttribute('data-size');
          
          if (selectedSizes.has(size)) {
            selectedSizes.delete(size);
            newPill.classList.remove('selected');
          } else {
            selectedSizes.add(size);
            newPill.classList.add('selected');
          }
          
          updateVariantMatrix();
        });
      });
      
      // Update sizePills reference to the new nodes
      if (categorySelect && categorySelect.value === 'Shoes & Accessories') {
        sizePills = shoeSizesContainer ? shoeSizesContainer.querySelectorAll('.size-pill') : [];
      } else {
        sizePills = clothingSizesContainer ? clothingSizesContainer.querySelectorAll('.size-pill') : [];
      }
    }

    // Step navigation
    if (nextBtn) {
      nextBtn.addEventListener('click', goToNextStep);
    }
    
    if (prevBtn) {
      prevBtn.addEventListener('click', goToPrevStep);
    }
    
    // Initial size selection setup
    attachSizePillListeners();
    
    // Custom shoe size input handlers
    if (addCustomShoeSizeBtn) {
      addCustomShoeSizeBtn.addEventListener('click', addCustomShoeSize);
    }
    
    // Initialize navigation buttons visibility
    updateNavigationButtons();
    
    if (customShoeSizeField) {
      customShoeSizeField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addCustomShoeSize();
        }
      });
    }

    // Preset color selection
    presetColorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const colorHex = btn.getAttribute('data-color');
        const colorName = btn.getAttribute('data-name');
        
        if (selectedColors.has(colorHex)) {
          selectedColors.delete(colorHex);
          btn.classList.remove('selected');
          delete colorConfigs[colorHex];
        } else {
          selectedColors.set(colorHex, { name: colorName, hex: colorHex });
          btn.classList.add('selected');
          colorConfigs[colorHex] = {
            name: colorName,
            images: []
          };
        }
        
        updateColorConfigDisplay();
        updateVariantMatrix();
      });
    });

    // Custom color addition
    if (addCustomColorBtn) {
      addCustomColorBtn.addEventListener('click', addCustomColor);
    }

    // Enter key for custom color
    if (customColorName) {
      customColorName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          addCustomColor();
        }
      });
    }
    
    // Default images handling
    setupDefaultImagesHandling();
    
    // Form submission
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
      console.log('Form submission handler attached');
    } else {
      console.error('Form element not found!');
      // Fallback: try to find form again
      const formRetry = document.getElementById('addProductForm');
      if (formRetry) {
        formRetry.addEventListener('submit', handleFormSubmit);
        console.log('Form submission handler attached (retry)');
      }
    }
    
    // Also attach click handler to submit button as fallback
    if (submitBtn) {
      submitBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Submit button clicked directly');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        } else {
          handleFormSubmit(e);
        }
      });
    }
  }

  function setupDefaultImagesHandling() {
    const defaultImagesInput = document.getElementById('defaultImages');
    const defaultImagesPreview = document.getElementById('defaultImagesPreview');
    const defaultImagesGrid = document.getElementById('defaultImagesGrid');

    if (defaultImagesInput) {
      defaultImagesInput.addEventListener('change', (e) => {
        handleDefaultImagesChange(e.target.files);
      });
    }

    function handleDefaultImagesChange(files) {
      defaultImagesFiles = Array.from(files);
      updateDefaultImagesPreview();
    }

    function updateDefaultImagesPreview() {
      if (defaultImagesFiles.length === 0) {
        defaultImagesPreview.style.display = 'none';
        return;
      }

      defaultImagesPreview.style.display = 'block';
      defaultImagesGrid.innerHTML = '';

      defaultImagesFiles.forEach((file, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'default-image-item';
        
        const reader = new FileReader();
        reader.onload = (e) => {
          imageItem.innerHTML = `
            <img src="${e.target.result}" alt="Default image ${index + 1}" class="default-image-preview">
            <button type="button" class="default-image-remove" data-index="${index}">
              <i class="fas fa-times"></i>
            </button>
            <div class="default-image-order">#${index + 1}</div>
          `;
          
          // Add remove functionality
          const removeBtn = imageItem.querySelector('.default-image-remove');
          removeBtn.addEventListener('click', () => {
            removeDefaultImage(index);
          });
        };
        reader.readAsDataURL(file);
        
        defaultImagesGrid.appendChild(imageItem);
      });
    }

    function removeDefaultImage(index) {
      defaultImagesFiles.splice(index, 1);
      
      // Update the file input
      const dt = new DataTransfer();
      defaultImagesFiles.forEach(file => dt.items.add(file));
      defaultImagesInput.files = dt.files;
      
      updateDefaultImagesPreview();
    }
  }

  function addCustomColor() {
    const name = customColorName.value.trim();
    const hex = customColorPicker.value;

    if (!name) {
      showToast('Please enter a color name', 'error');
      customColorName.focus();
      return;
    }

    if (selectedColors.has(hex)) {
      showToast('This color is already added', 'error');
      return;
    }

    // Add to selected colors
    selectedColors.set(hex, { name: name, hex: hex });
    colorConfigs[hex] = {
      name: name,
      images: []
    };

    // Clear inputs
    customColorName.value = '';
    customColorPicker.value = '#ff0000';

    updateColorConfigDisplay();
    updateVariantMatrix();
    showToast(`${name} color added successfully`, 'success');
  }
  
  function updateColorConfigDisplay() {
    colorsConfigGrid.innerHTML = '';
    
    if (selectedColors.size === 0) {
        colorsConfigGrid.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 3rem; color: #6c757d;">
                <i class="fas fa-palette" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                <p>Select colors above to configure them with images</p>
            </div>
        `;
        return;
    }

    selectedColors.forEach((colorData, colorHex) => {
        const colorCard = createColorConfigCard(colorHex, colorData);
        colorsConfigGrid.appendChild(colorCard);
        
        // Restore image previews if they exist
        const config = colorConfigs[colorHex];
        if (config && config.images && config.images.length > 0) {
            const previewContainer = colorCard.querySelector('.image-previews');
            config.images.forEach(file => {
                createImagePreview(file, colorHex, 'color', previewContainer);
            });
        }
    });
  }

  function createImagePreview(file, identifier, type, previewContainer) {
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    preview.style.cssText = `
        position: relative;
        border-radius: 8px;
        overflow: hidden;
        aspect-ratio: 1;
        border: 2px solid #dee2e6;
        transition: all 0.2s ease;
    `;
    
    // If file is already a URL (for existing images)
    if (typeof file === 'string') {
        renderPreview(file);
    } else {
        // If file is a File object
        const reader = new FileReader();
        reader.onload = (e) => renderPreview(e.target.result);
        reader.readAsDataURL(file);
    }

    function renderPreview(src) {
        preview.innerHTML = `
            <img src="${src}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover;">
            <button type="button" class="image-remove-btn" style="
                position: absolute;
                top: -8px;
                right: -8px;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #dc3545;
                color: white;
                border: 2px solid white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.6rem;
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                transition: all 0.2s ease;
            ">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Add remove functionality
        const removeBtn = preview.querySelector('.image-remove-btn');
        removeBtn.addEventListener('click', () => {
            const index = Array.from(previewContainer.children).indexOf(preview);
            if (type === 'color') {
                colorConfigs[identifier].images.splice(index, 1);
            }
            preview.remove();
        });
    }
    
    previewContainer.appendChild(preview);
  }

  function createColorConfigCard(colorHex, colorData) {
    const config = colorConfigs[colorHex];
    
    const card = document.createElement('div');
    card.className = 'color-config-card';
    
    card.innerHTML = `
      <div class="color-config-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="color-dot" style="
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
            background-color: ${colorHex};
          "></span>
          <h6 class="mb-0">${colorData.name}</h6>
        </div>
        <button type="button" class="btn btn-sm btn-outline-danger remove-color-btn" data-color="${colorHex}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      
      <div class="color-config-form">
        <div class="mt-3">
          <label class="form-label">Color Image <span class="text-danger">*</span></label>
          <div class="image-upload-area" data-color="${colorHex}" style="
            border: 2px dashed #dee2e6;
            border-radius: 8px;
            padding: 1rem;
            text-align: center;
            background: white;
            cursor: pointer;
            margin-bottom: 0.75rem;
            transition: all 0.2s ease;
          ">
            <div class="upload-icon" style="font-size: 1.5rem; color: #6c757d; margin-bottom: 0.5rem;">
              <i class="fas fa-cloud-upload-alt"></i>
            </div>
            <div class="upload-text" style="font-size: 0.9rem; color: #6c757d; margin-bottom: 0.5rem;">Click or drag one image here</div>
            <div class="upload-hint" style="font-size: 0.75rem; color: #868e96;">PNG, JPG up to 5MB - Required</div>
            <input type="file" class="d-none color-image-input" accept="image/*" data-color="${colorHex}">
          </div>
          <div class="image-previews" data-color="${colorHex}" style="
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin-top: 10px;
            min-height: 30px;
          ">
            <small class="text-muted">No images uploaded yet</small>
          </div>
        </div>
      </div>
    `;
    
    // Setup event listeners for this color card
    setupColorCardListeners(card, colorHex);
    
    return card;
  }

  function setupColorCardListeners(card, colorHex) {
    // Remove color button
    const removeBtn = card.querySelector('.remove-color-btn');
    removeBtn.addEventListener('click', () => {
      const colorName = selectedColors.get(colorHex).name;
      if (confirm(`Remove ${colorName} color and all its configurations?`)) {
        selectedColors.delete(colorHex);
        delete colorConfigs[colorHex];
        
        // Update preset color button if it exists
        const presetBtn = document.querySelector(`.preset-color-btn[data-color="${colorHex}"]`);
        if (presetBtn) {
          presetBtn.classList.remove('selected');
        }
        
        updateColorConfigDisplay();
        updateVariantMatrix();
      }
    });

    // Image upload
    setupImageUpload(card, colorHex, 'color');
  }

  function setupImageUpload(container, identifier, type) {
    const uploadArea = container.querySelector('.image-upload-area');
    const fileInput = container.querySelector(`.${type}-image-input`);
    const previewContainer = container.querySelector('.image-previews');
    
    // Upload area hover effects
    uploadArea.addEventListener('mouseenter', () => {
      uploadArea.style.borderColor = '#fe8982';
      uploadArea.style.background = '#fef7f6';
    });
    
    uploadArea.addEventListener('mouseleave', () => {
      uploadArea.style.borderColor = '#dee2e6';
      uploadArea.style.background = 'white';
    });
    
    // Click to upload
    uploadArea.addEventListener('click', () => {
      fileInput.click();
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '#fe8982';
      uploadArea.style.background = '#fef7f6';
    });
    
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.borderColor = '#dee2e6';
      uploadArea.style.background = 'white';
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '#dee2e6';
      uploadArea.style.background = 'white';
      const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
      handleImageFiles(files, identifier, type, previewContainer);
    });
    
    // File input change
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      handleImageFiles(files, identifier, type, previewContainer);
    });
  }

  function handleImageFiles(files, identifier, type, previewContainer) {
    if (type === 'color') {
        // For color variants, only accept one image
        const file = files[0]; // Take only the first file
        if (!file) return;
        
        if (file.size > 5 * 1024 * 1024) {
            showToast(`Image ${file.name} is too large (max 5MB)`, 'error');
            return;
        }
        
        // Clear previous previews and set single image
        previewContainer.innerHTML = '';
        
        if (!colorConfigs[identifier].images) {
            colorConfigs[identifier].images = [];
        }
        
        // Replace any existing image with new one
        colorConfigs[identifier].images = [file];

        // Create preview immediately
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'color-image-preview';
            imageContainer.style.cssText = `
                position: relative;
                border-radius: 8px;
                overflow: hidden;
                border: 2px solid #28a745;
                margin: 5px 0;
                display: inline-block;
                width: 100px;
                height: 100px;
            `;

            imageContainer.innerHTML = `
                <img src="${e.target.result}" 
                     alt="${colorConfigs[identifier].name} preview" 
                     title="${file.name}"
                     style="width: 100%; height: 100%; object-fit: cover;">
                <button type="button" class="remove-image-btn" style="
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #dc3545;
                    color: white;
                    border: 2px solid white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 12px;
                    padding: 0;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                ">×</button>
                <div style="
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: rgba(40, 167, 69, 0.9);
                    color: white;
                    padding: 4px;
                    font-size: 10px;
                    text-align: center;
                    font-weight: 500;
                ">✓ Image Added</div>
            `;

            // Add remove functionality
            const removeBtn = imageContainer.querySelector('.remove-image-btn');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                colorConfigs[identifier].images = [];
                imageContainer.remove();
                
                // Show "No images" message
                previewContainer.innerHTML = '<small class="text-muted">Click above to upload an image</small>';
                
                updateVariantMatrix();
            });

            previewContainer.appendChild(imageContainer);
        };
        reader.readAsDataURL(file);
    }

    updateVariantMatrix();
  }

  function updateVariantMatrix() {
    // Clear existing matrix
    Object.keys(variantMatrix).forEach(key => delete variantMatrix[key]);

    // Show/hide matrix section based on selections
    const matrixSection = document.getElementById('variantMatrixSection');
    const matrixContainer = document.getElementById('variantMatrix');
    
    if (selectedSizes.size === 0 || selectedColors.size === 0) {
      matrixSection.style.display = 'none';
      return;
    }
    
    matrixSection.style.display = 'block';

    // Generate matrix for each size-color combination
    selectedSizes.forEach(size => {
      selectedColors.forEach((colorData, colorHex) => {
        const key = `${size}_${colorHex}`;
        const existing = variantMatrix[key] || {};

        variantMatrix[key] = {
          size: size,
          color: colorHex,
          colorName: colorData.name,
          price: existing.price || 0,
          discountPrice: existing.discountPrice || null,
          stock: existing.stock || 0,
          colorImages: colorConfigs[colorHex]?.images || []
        };
      });
    });

    // Generate matrix HTML
    generateVariantMatrixHTML();
  }

  function generateVariantMatrixHTML() {
    const matrixContainer = document.getElementById('variantMatrix');
    const sizesArray = Array.from(selectedSizes);
    const colorsArray = Array.from(selectedColors.values());

    let matrixHTML = `
      <div class="variant-matrix-container">
        <table class="matrix-table">
          <thead class="table-light">
            <tr>
              <th>Size / Color</th>
              ${colorsArray.map(color => `
                <th>
                  <div class="d-flex align-items-center gap-2">
                    <span class="color-dot" style="
                      width: 16px; height: 16px; border-radius: 50%;
                      background-color: ${color.hex}; border: 1px solid #ccc;
                      flex-shrink: 0;
                    "></span>
                    <span class="text-truncate">${color.name}</span>
                  </div>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    sizesArray.forEach(size => {
      matrixHTML += `<tr><td class="fw-bold text-center">${size}</td>`;
      
      colorsArray.forEach(color => {
        const key = `${size}_${color.hex}`;
        const variant = variantMatrix[key] || {};
        
        matrixHTML += `
          <td class="p-2">
            <div class="variant-cell">
              <div class="row g-2">
                <div class="col-6">
                  <label class="form-label small mb-1">Base Price (₱)</label>
                  <input type="number" class="form-control form-control-sm variant-price" 
                         data-variant="${key}" data-field="price"
                         value="${variant.price || ''}" min="0" step="0.01" placeholder="0.00">
                </div>
                <div class="col-6">
                  <label class="form-label small mb-1">Stock</label>
                  <input type="number" class="form-control form-control-sm variant-stock" 
                         data-variant="${key}" data-field="stock"
                         value="${variant.stock || ''}" min="0" placeholder="0">
                </div>
                <div class="col-12">
                  <label class="form-label small mb-1">Discount Price (₱)</label>
                  <input type="number" class="form-control form-control-sm variant-discount" 
                         data-variant="${key}" data-field="discountPrice"
                         value="${variant.discountPrice || ''}" min="0" step="0.01" placeholder="Optional">
                  <div class="invalid-feedback text-danger small">
                    Discount must be less than base price
                  </div>
                </div>
              </div>
              <div class="pricing-preview mt-2" id="preview-${key}" style="display: none;">
                <!-- Price preview will be shown here -->
              </div>
            </div>
          </td>
        `;
      });
      
      matrixHTML += '</tr>';
    });

    matrixHTML += '</tbody></table></div>';
    matrixContainer.innerHTML = matrixHTML;

    // Add event listeners to matrix inputs
    setupMatrixEventListeners();
  }

  function setupMatrixEventListeners() {
    // Add event listeners for all matrix inputs
    document.querySelectorAll('.variant-price, .variant-stock, .variant-discount').forEach(input => {
      input.addEventListener('input', handleVariantInputChange);
      input.addEventListener('blur', handleVariantInputBlur);
    });
  }

  function handleVariantInputChange(e) {
    const key = e.target.dataset.variant;
    const field = e.target.dataset.field;
    const value = e.target.value;
    
    if (!variantMatrix[key]) return;
    
    // Update the variant data
    if (field === 'discountPrice') {
      variantMatrix[key][field] = value ? parseFloat(value) : null;
    } else {
      variantMatrix[key][field] = value ? parseFloat(value) : 0;
    }
    
    // Update price preview
    updateVariantPricePreview(key);
  }

  function handleVariantInputBlur(e) {
    const key = e.target.dataset.variant;
    const field = e.target.dataset.field;
    
    if (field === 'discountPrice') {
      const variant = variantMatrix[key];
      const basePrice = variant.price || 0;
      const discountPrice = variant.discountPrice;
      
      if (discountPrice && basePrice > 0 && discountPrice >= basePrice) {
        e.target.classList.add('is-invalid');
        showToast(`Discount price must be less than base price (₱${basePrice.toFixed(2)}) for ${variant.size} - ${variant.colorName}`, 'error');
      } else {
        e.target.classList.remove('is-invalid');
      }
    }
  }

  function updateVariantPricePreview(key) {
    const variant = variantMatrix[key];
    const preview = document.getElementById(`preview-${key}`);
    
    if (!variant || !preview) return;
    
    const hasPrice = variant.price > 0;
    const hasStock = variant.stock > 0;
    const hasDiscount = variant.discountPrice && variant.discountPrice < variant.price;
    
    if (!hasPrice && !hasStock) {
      preview.style.display = 'none';
      return;
    }
    
    let previewHTML = '<div class="pricing-display small">';
    
    if (hasPrice) {
      if (hasDiscount) {
        const savings = Math.round(((variant.price - variant.discountPrice) / variant.price) * 100);
        previewHTML += `
          <div class="price-info text-success">
            <strong>₱${variant.discountPrice.toFixed(2)}</strong>
            <span class="text-muted text-decoration-line-through ms-1">₱${variant.price.toFixed(2)}</span>
            <span class="badge bg-success ms-1">${savings}% off</span>
          </div>
        `;
      } else {
        previewHTML += `<div class="price-info"><strong>₱${variant.price.toFixed(2)}</strong></div>`;
      }
    }
    
    if (hasStock) {
      previewHTML += `<div class="stock-info text-muted">${variant.stock} in stock</div>`;
    }
    
    previewHTML += '</div>';
    preview.innerHTML = previewHTML;
    preview.style.display = 'block';
  }

  function goToNextStep() {
    if (!validateStep(currentStep)) return;
    
    document.getElementById(`step${currentStep}`).classList.remove('active');
    stepIndicators[currentStep - 1].classList.remove('active');
    
    currentStep++;
    
    document.getElementById(`step${currentStep}`).classList.add('active');
    stepIndicators[currentStep - 1].classList.add('active');
    
    updateNavigationButtons();
    
    if (currentStep === 3) {
      updateSummary();
    }
  }
  
  function goToPrevStep() {
    document.getElementById(`step${currentStep}`).classList.remove('active');
    stepIndicators[currentStep - 1].classList.remove('active');
    
    currentStep--;
    
    document.getElementById(`step${currentStep}`).classList.add('active');
    stepIndicators[currentStep - 1].classList.add('active');
    
    updateNavigationButtons();
  }
  
  function updateNavigationButtons() {
    if (currentStep === 1) {
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'block';
      if (submitBtn) submitBtn.style.display = 'none';
    } else if (currentStep === 3) {
      if (prevBtn) prevBtn.style.display = 'block';
      if (nextBtn) nextBtn.style.display = 'none';
      if (submitBtn) {
        submitBtn.style.display = 'block';
        submitBtn.disabled = false;
      }
    } else {
      if (prevBtn) prevBtn.style.display = 'block';
      if (nextBtn) nextBtn.style.display = 'block';
      if (submitBtn) submitBtn.style.display = 'none';
    }
  }
  
  function validateStep(step) {
    // Clear previous validation states
    document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    
    switch(step) {
      case 1:
        const nameInput = document.querySelector('input[name="name"]');
        const categorySelect = document.querySelector('select[name="category"]');
        const descriptionTextarea = document.querySelector('textarea[name="description"]');
        const defaultImages = document.getElementById('defaultImages');
        
        const name = nameInput.value.trim();
        const category = categorySelect.value;
        const description = descriptionTextarea.value.trim();
        
        let hasErrors = false;
        let errorMessages = [];
        
        if (!name) {
          nameInput.classList.add('is-invalid');
          errorMessages.push('Product name is required');
          hasErrors = true;
        } else if (name.length < 3) {
          nameInput.classList.add('is-invalid');
          errorMessages.push('Product name must be at least 3 characters long');
          hasErrors = true;
        }
        
        if (!category) {
          categorySelect.classList.add('is-invalid');
          errorMessages.push('Please select a product category');
          hasErrors = true;
        }
        
        if (!description) {
          descriptionTextarea.classList.add('is-invalid');
          errorMessages.push('Product description is required');
          hasErrors = true;
        } else if (description.length < 10) {
          descriptionTextarea.classList.add('is-invalid');
          errorMessages.push('Product description must be at least 10 characters long');
          hasErrors = true;
        }
        
        if (!defaultImages || defaultImages.files.length === 0) {
          defaultImages.classList.add('is-invalid');
          errorMessages.push('At least one default product image is required');
          hasErrors = true;
        }
        
        if (hasErrors) {
          const errorMessage = 'Please fix the following issues:\n• ' + errorMessages.join('\n• ');
          showToast(errorMessage.replace(/\n/g, '<br>'), 'error');
          return false;
        }
        break;
        
      case 2:
        let step2Errors = [];
        let step2HasErrors = false;
        
        if (selectedColors.size === 0) {
          step2Errors.push('Please select at least one color');
          step2HasErrors = true;
        }
        
        if (selectedSizes.size === 0) {
          step2Errors.push('Please select at least one size');
          step2HasErrors = true;
        }
        
        // Check if each selected color has an image
        selectedColors.forEach((colorData, colorHex) => {
          const config = colorConfigs[colorHex];
          if (!config || !config.images || config.images.length === 0) {
            step2Errors.push(`Please upload an image for ${colorData.name} color`);
            step2HasErrors = true;
          }
        });
        
        if (step2HasErrors) {
          const errorMessage = 'Please fix the following issues:\n• ' + step2Errors.join('\n• ');
          showToast(errorMessage.replace(/\n/g, '<br>'), 'error');
          return false;
        }
        
        // Validate that at least one variant has proper configuration
        let hasValidVariant = false;
        let hasInvalidDiscounts = false;
        const invalidVariants = [];
        
        Object.entries(variantMatrix).forEach(([key, variant]) => {
          if (variant.price > 0 && variant.stock > 0) {
            hasValidVariant = true;
            
            // Check discount price validity
            if (variant.discountPrice && variant.discountPrice >= variant.price) {
              hasInvalidDiscounts = true;
              invalidVariants.push(`${variant.size} - ${variant.colorName}`);
            }
          }
        });
        
        if (!hasValidVariant) {
          showToast('Please configure at least one size-color variant with price and stock', 'error');
          return false;
        }
        
        if (hasInvalidDiscounts) {
          const variantList = invalidVariants.join(', ');
          showToast(`Invalid discount prices for: ${variantList}. Discount must be less than base price.`, 'error');
          
          // Highlight invalid inputs
          invalidVariants.forEach(variantName => {
            const [size, colorName] = variantName.split(' - ');
            const colorHex = Array.from(selectedColors.entries())
              .find(([hex, data]) => data.name === colorName)?.[0];
            if (colorHex) {
              const key = `${size}_${colorHex}`;
              const discountInput = document.querySelector(`.variant-discount[data-variant="${key}"]`);
              if (discountInput) {
                discountInput.classList.add('is-invalid');
              }
            }
          });
          
          return false;
        }
        
        // Remove any existing invalid markers if validation passes
        document.querySelectorAll('.variant-discount.is-invalid').forEach(input => {
          input.classList.remove('is-invalid');
        });
        return true;
        
      case 3:
        // Final validation before submission
        if (selectedSizes.size === 0) {
          showToast('Please add at least one size', 'error');
          return false;
        }
        if (selectedColors.size === 0) {
          showToast('Please add at least one color', 'error');
          return false;
        }
        
        // Check if variants have stock and price
        let hasValidVariantFinal = false;
        Object.values(variantMatrix).forEach(variant => {
          if (variant.stock > 0 && variant.price > 0) {
            hasValidVariantFinal = true;
          }
        });
        
        if (!hasValidVariantFinal) {
          showToast('Please add stock and price for at least one variant', 'error');
          return false;
        }
        break;
    }
    return true;
  }

  function updateSummary() {
    // Basic info
    document.getElementById('summary-name').textContent = 
        document.querySelector('input[name="name"]').value || '-';
    document.getElementById('summary-category').textContent = 
        document.querySelector('select[name="category"]').value || '-';
    document.getElementById('summary-description').textContent = 
        document.querySelector('textarea[name="description"]').value || '-';
    
    // Flash sale status
    const isFlashSale = document.querySelector('input[name="is_flash_sale"]').checked;
    document.getElementById('summary-flash-sale').innerHTML = isFlashSale 
        ? '<span class="badge bg-warning text-dark"><i class="fas fa-bolt me-1"></i>Enabled</span>' 
        : '<span class="text-muted">Disabled</span>';

    // Configuration summary
    const sizesArray = Array.from(selectedSizes);
    const colorsArray = Array.from(selectedColors.values());

    document.getElementById('summary-sizes').innerHTML = sizesArray.length > 0 
        ? sizesArray.map(size => `<span class="badge bg-secondary me-1">${size}</span>`).join('')
        : '-';

    document.getElementById('summary-colors').innerHTML = colorsArray.length > 0 
        ? colorsArray.map(color => `<span class="badge me-1" style="background-color: ${color.hex}; color: ${getContrastColor(color.hex)};">${color.name}</span>`).join('')
        : '-';

    // Variants and stock from matrix
    const totalVariants = Object.keys(variantMatrix).length;
    let totalStock = 0;

    Object.values(variantMatrix).forEach(variant => {
      totalStock += variant.stock || 0;
    });

    document.getElementById('summary-total-variants').textContent = totalVariants;
    document.getElementById('summary-total-stock').textContent = totalStock;

    // Matrix preview
    updateMatrixPreview();

    // Images preview
    updateImagesPreview();
  }

  function updateMatrixPreview() {
    const matrixContainer = document.getElementById('summary-variants-matrix');
    
    if (Object.keys(variantMatrix).length === 0) {
      matrixContainer.innerHTML = '<p class="text-muted">No variants configured</p>';
      return;
    }

    const sizesArray = Array.from(selectedSizes);
    const colorsArray = Array.from(selectedColors.values());

    let tableHTML = `
      <div style="overflow-x: auto;">
        <table class="table table-sm matrix-table">
          <thead>
            <tr>
              <th>Size / Color</th>
              ${colorsArray.map(color => `
                <th style="min-width: 120px;">
                  <div style="display: flex; align-items: center; gap: 0.25rem;">
                    <span class="color-dot" style="
                      width: 12px; height: 12px; border-radius: 50%;
                      background-color: ${color.hex}; border: 1px solid #ccc;
                    "></span>
                    <small>${color.name}</small>
                  </div>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    sizesArray.forEach(size => {
      tableHTML += `<tr><td><strong>${size}</strong></td>`;
      
      colorsArray.forEach(color => {
        const variant = variantMatrix[`${size}_${color.hex}`];
        const hasStock = variant && variant.stock > 0;
        const price = variant ? variant.price : 0;
        const discountPrice = variant ? variant.discountPrice : null;
        
        let cellContent = '';
        let cellClass = hasStock ? 'matrix-cell-filled' : 'matrix-cell-empty';
        
        if (hasStock) {
          if (discountPrice && discountPrice < price) {
            const savings = calculateDiscountPercentage(price, discountPrice);
            cellContent = `
              <div style="font-size: 0.7rem;">
                <div>₱${discountPrice.toFixed(2)} <small class="text-muted text-decoration-line-through">₱${price.toFixed(2)}</small></div>
                <div>${variant.stock} pcs <span class="badge bg-success">${savings}%</span></div>
              </div>
            `;
          } else {
            cellContent = `
              <div style="font-size: 0.7rem;">
                <div>₱${price.toFixed(2)}</div>
                <div>${variant.stock} pcs</div>
              </div>
            `;
          }
        } else {
          cellContent = '<small class="text-muted">No stock</small>';
        }
        
        tableHTML += `<td class="${cellClass}">${cellContent}</td>`;
      });
      
      tableHTML += '</tr>';
    });

    tableHTML += '</tbody></table></div>';
    matrixContainer.innerHTML = tableHTML;
  }

  function updateImagesPreview() {
    const imagesContainer = document.getElementById('summary-images-preview');
    imagesContainer.innerHTML = '';

    // Default images
    const defaultImagesInput = document.getElementById('defaultImages');
    if (defaultImagesInput && defaultImagesInput.files.length > 0) {
      Array.from(defaultImagesInput.files).forEach((file, index) => {
        const defaultPreview = document.createElement('div');
        defaultPreview.className = 'color-preview-item';
        defaultPreview.innerHTML = `
          <img src="${URL.createObjectURL(file)}" alt="Default image ${index + 1}" class="color-preview-image">
          <div class="color-name">Default #${index + 1}</div>
        `;
        imagesContainer.appendChild(defaultPreview);
      });
    }

    // Color images
    selectedColors.forEach((colorData, colorHex) => {
      const config = colorConfigs[colorHex];
      if (config.images && config.images.length > 0) {
        config.images.forEach((file, index) => {
          const preview = document.createElement('div');
          preview.className = 'image-preview-item';
          preview.innerHTML = `
            <img src="${URL.createObjectURL(file)}" alt="${colorData.name} image ${index + 1}">
            <div class="image-label" style="
              position: absolute; bottom: 0; left: 0; right: 0;
              background: rgba(0,0,0,0.7); color: white;
              padding: 0.25rem 0.5rem; font-size: 0.7rem;
            ">${colorData.name}</div>
          `;
          preview.style.position = 'relative';
          imagesContainer.appendChild(preview);
        });
      }
    });

    if (imagesContainer.children.length === 0) {
      imagesContainer.innerHTML = '<p class="text-muted">No images uploaded</p>';
    }
  }

  function getContrastColor(hexColor) {
    // Convert hex to RGB
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    e.stopPropagation();

    console.log('Form submit triggered');
    
    if (!validateStep(3)) {
      console.log('Validation failed');
      return;
    }
    
    console.log('Validation passed, proceeding with submission');

    const confirmationMessage = [
      'Submit this product for admin approval?',
      'It will stay hidden from buyers until an admin approves it.',
      '',
      'Click "OK" to continue.'
    ].join('\n');

    if (!window.confirm(confirmationMessage)) {
      showToast('Product submission cancelled.', 'info');
      return;
    }

    const formData = new FormData();
    
    // Add basic product info
    const name = document.querySelector('input[name="name"]').value.trim();
    const category = document.querySelector('select[name="category"]').value;
    const description = document.querySelector('textarea[name="description"]').value.trim();
    const isFlashSale = document.querySelector('input[name="is_flash_sale"]').checked;

    if (!name || !category) {
        showToast('Product name and category are required', 'error');
        return;
    }

    formData.append('name', name);
    formData.append('category', category);
    formData.append('description', description);
    formData.append('is_flash_sale', isFlashSale ? '1' : '0');

    // Add default product images
    const defaultImagesInput = document.getElementById('defaultImages');
    if (defaultImagesInput && defaultImagesInput.files.length > 0) {
        Array.from(defaultImagesInput.files).forEach((file, index) => {
            formData.append('default_images[]', file);
            formData.append('default_image_orders[]', index);
        });
    }

    // Add variant images with color information and display order
    selectedColors.forEach((colorData, colorHex) => {
        const config = colorConfigs[colorHex];
        if (config && config.images && config.images.length > 0) {
            config.images.forEach((file, index) => {
                formData.append('variant_images[]', file);
                formData.append('variant_colors[]', colorHex);
                formData.append('variant_color_names[]', colorData.name);
                formData.append('variant_display_orders[]', index); // Add display order
            });
        }
    });

    // Process size-color variants
    const sizeColorData = {};
    let totalStock = 0;
    let minPrice = Infinity;

    selectedSizes.forEach(size => {
        sizeColorData[size] = {};
        
        selectedColors.forEach((colorData, colorHex) => {
            const variant = variantMatrix[`${size}_${colorHex}`];
            if (variant && variant.price > 0) {
                sizeColorData[size][colorHex] = {
                    name: colorData.name,
                    price: variant.price,
                    discount_price: variant.discountPrice || null,
                    stock: variant.stock || 0,
                    images: colorConfigs[colorHex]?.images?.map(file => URL.createObjectURL(file)) || []
                };
                
                totalStock += variant.stock || 0;
                const effectivePrice = variant.discountPrice || variant.price;
                if (effectivePrice < minPrice) {
                    minPrice = effectivePrice;
                }
            }
        });
    });

    if (Object.keys(sizeColorData).length === 0) {
        showToast('Please configure at least one valid size/color variant', 'error');
        return;
    }

    formData.append('size_color_data', JSON.stringify(sizeColorData));
    formData.append('total_stock', totalStock);
    formData.append('min_price', minPrice === Infinity ? 0 : minPrice);

    try {
        const submitBtn = document.getElementById('submitBtn');
        if (!submitBtn) {
          throw new Error('Submit button not found');
        }
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Saving...';
        
        console.log('Starting product submission...');

        if (!AuthManager.isLoggedIn()) {
            throw new Error('You must be logged in to add products');
            return;
        }
        
        const token = AuthManager.getAuthToken();
        if (!token) {
            throw new Error('Authentication failed. Please log in again.');
            return;
        }

        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to add product');
        }

        const successMessage = result.message || 'Product submitted for review. It will be visible after admin approval.';
        showToast(successMessage, 'success');
        setTimeout(() => {
            alert(successMessage + '\n\nReminder: buyers will only see this product after an admin approves it.');
        }, 100);
        setTimeout(() => {
            window.location.href = '/templates/SellerDashboard/inventory.html';
        }, 1500);

    } catch (error) {
        console.error('Error submitting product:', error);
        showToast(error.message || 'Failed to save product. Please try again.', 'error');
    } finally {
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fas fa-save me-2"></i>Save Product';
        }
    }
}
});

