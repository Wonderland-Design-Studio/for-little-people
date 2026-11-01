/**
 * ==========================================================================
 * FOR LITTLE PEOPLE - E-COMMERCE & PAYFAST INTEGRATION ENGINE
 * ==========================================================================
 * Seamless South African PayFast shopping cart, fast courier shipping calculation,
 * and automated payment checkout.
 */

// ==========================================================================
// 1. PAYFAST CONFIGURATION
// ==========================================================================
// When you receive your live PayFast Merchant ID and Merchant Key from PayFast:
// 1. Change 'sandbox' to false
// 2. Insert your 'merchant_id' and 'merchant_key' below.
const PAYFAST_CONFIG = {
    // Set to false for live production transactions, true for testing
    sandbox: true,

    // PayFast Test Sandbox credentials (Default)
    // Replace with your real Merchant ID & Key when ready!
    merchant_id: '10000100',
    merchant_key: '46f0cd694581a',

    // Optional: Passphrase (only if enabled in your PayFast settings)
    passphrase: '',

    // URLs for payment redirect
    return_url: window.location.origin + window.location.pathname + '?payment=success',
    cancel_url: window.location.origin + window.location.pathname + '?payment=cancelled',
    notify_url: window.location.origin + '/api/payfast-notify',

    // South Africa Courier Shipping Rules
    shipping: {
        courierFee: 75.00,           // Standard Courier nationwide (ZAR)
        freeShippingThreshold: 400.00 // Free nationwide courier delivery for orders over R400
    }
};

// ==========================================================================
// 2. BOOK CATALOG DATA
// ==========================================================================
const BOOKS_CATALOG = {
    'the-perfect-christmas': {
        id: 'the-perfect-christmas',
        title: 'The Perfect Christmas',
        subtitle: 'A Heartwarming Story of Friendship, Family and Love',
        price: 160.00,
        currency: 'ZAR',
        cover: 'assets/ThePerfectChristmas_cover.png',
        badge: 'Festive Favorite',
        modalId: 'book4Modal'
    },
    'hosi-and-the-whales': {
        id: 'hosi-and-the-whales',
        title: 'Hosi and the Whales',
        subtitle: 'An Ocean Adventure of Bravery & Marine Wonder',
        price: 160.00,
        currency: 'ZAR',
        cover: 'assets/HosiAndTheWhales_cover.png',
        badge: 'New Release',
        modalId: 'book5Modal'
    },
    'i-am-beautiful': {
        id: 'i-am-beautiful',
        title: 'I am Beautiful and So Are You!',
        subtitle: 'A Joyful Celebration of Self-Love & Uniqueness',
        price: 160.00,
        currency: 'ZAR',
        cover: 'assets/Iambeautiful_cover.png',
        badge: 'Bestseller',
        modalId: 'book1Modal'
    },
    'the-hundred-dresses': {
        id: 'the-hundred-dresses',
        title: 'The Story of a Hundred Dresses',
        subtitle: 'Interactive Cultural Heritage & Counting Adventure',
        price: 160.00,
        currency: 'ZAR',
        cover: 'assets/HundredDresses_cover.png',
        badge: 'Educational',
        modalId: 'book2Modal'
    },
    'bumble-the-bee': {
        id: 'bumble-the-bee',
        title: 'The Story of Bumble the Bee',
        subtitle: 'A Gentle Tale About Self-Confidence & Joy',
        price: 160.00,
        currency: 'ZAR',
        cover: 'assets/BumbleBee_cover.png',
        badge: 'Heartwarming',
        modalId: 'book3Modal'
    },
    'complete-bundle-5': {
        id: 'complete-bundle-5',
        title: "Complete 5-Book Collector's Bundle",
        subtitle: 'All 5 beloved books + FREE nationwide courier delivery!',
        price: 680.00,
        originalPrice: 800.00,
        currency: 'ZAR',
        cover: 'assets/ThePerfectChristmas_cover.png',
        badge: 'Save R120 + Free Delivery',
        isBundle: true
    }
};

// ==========================================================================
// 3. CART STATE MANAGEMENT (LOCALSTORAGE)
// ==========================================================================
let cart = [];

function loadCart() {
    try {
        const saved = localStorage.getItem('flp_cart_v1');
        cart = saved ? JSON.parse(saved) : [];
    } catch (e) {
        cart = [];
    }
    updateCartUI();
}

function saveCart() {
    try {
        localStorage.setItem('flp_cart_v1', JSON.stringify(cart));
    } catch (e) {
        console.error('Could not save cart', e);
    }
    updateCartUI();
}

function addToCart(bookId, qty = 1, showDrawer = false) {
    const book = BOOKS_CATALOG[bookId];
    if (!book) return;

    const existingIndex = cart.findIndex(item => item.id === bookId);
    if (existingIndex > -1) {
        cart[existingIndex].qty += qty;
    } else {
        cart.push({
            id: book.id,
            title: book.title,
            price: book.price,
            cover: book.cover,
            qty: qty
        });
    }

    saveCart();
    showToast(`Added "${book.title}" to your cart!`);

    if (showDrawer) {
        openCartDrawer();
    }
}

function buyNow(bookId) {
    // Add item if not already in cart
    const existingIndex = cart.findIndex(item => item.id === bookId);
    if (existingIndex === -1) {
        addToCart(bookId, 1, false);
    }
    
    // Close any open book modals
    const activeModals = document.querySelectorAll('.story-modal-overlay.active');
    activeModals.forEach(modal => modal.classList.remove('active'));
    document.body.style.overflow = 'auto';

    // Open checkout directly
    openCartDrawer();
    showCheckoutView();
}

function removeFromCart(bookId) {
    cart = cart.filter(item => item.id !== bookId);
    saveCart();
}

function updateQty(bookId, delta) {
    const item = cart.find(i => i.id === bookId);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
        removeFromCart(bookId);
    } else {
        saveCart();
    }
}

function clearCart() {
    cart = [];
    saveCart();
}

function getSubtotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
}

function getShippingFee() {
    const subtotal = getSubtotal();
    if (subtotal === 0) return 0;
    if (subtotal >= PAYFAST_CONFIG.shipping.freeShippingThreshold) return 0;
    
    // Check if cart has the complete bundle (always free delivery)
    if (cart.some(item => item.id === 'complete-bundle-5')) return 0;

    return PAYFAST_CONFIG.shipping.courierFee;
}

function getGrandTotal() {
    return getSubtotal() + getShippingFee();
}

function getTotalItemCount() {
    return cart.reduce((sum, item) => sum + item.qty, 0);
}

// ==========================================================================
// 4. UI RENDERING & CONTROLS
// ==========================================================================
function updateCartUI() {
    const count = getTotalItemCount();
    const badges = document.querySelectorAll('#cartCountBadge, #mobileCartCount, #floatingCartCount');
    badges.forEach(b => {
        b.textContent = count;
        b.classList.remove('bump');
        void b.offsetWidth; // trigger reflow
        b.classList.add('bump');
    });

    // Mobile floating cart button visibility
    const floatingBtn = document.getElementById('floatingCartBtn');
    if (floatingBtn) {
        if (count > 0) {
            floatingBtn.classList.add('visible');
        } else {
            floatingBtn.classList.remove('visible');
        }
    }

    renderCartItems();
    renderSummary();
}

function renderCartItems() {
    const container = document.getElementById('cartItemsList');
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="cart-empty-state">
                <span class="cart-empty-icon">📚</span>
                <h3>Your cart is empty</h3>
                <p>Discover our beautiful storybooks and bring the magic of reading home.</p>
                <button class="btn btn-primary" onclick="closeCartDrawer(); window.location.hash='#our-books';" style="padding: 10px 24px;">Explore Books</button>
            </div>
        `;
        return;
    }

    let html = '';
    cart.forEach(item => {
        html += `
            <div class="cart-item-card">
                <img src="${item.cover}" alt="${item.title}" class="cart-item-img">
                <div class="cart-item-info">
                    <div>
                        <h4 class="cart-item-title">${item.title}</h4>
                        <div class="cart-item-price">R ${(item.price * item.qty).toFixed(2)} <span style="font-size:0.8rem; font-weight:normal; color:#888;">(R ${item.price.toFixed(2)} each)</span></div>
                    </div>
                    <div class="cart-item-actions">
                        <div class="qty-control">
                            <button class="qty-btn" onclick="updateQty('${item.id}', -1)" aria-label="Decrease quantity">&minus;</button>
                            <span class="qty-display">${item.qty}</span>
                            <button class="qty-btn" onclick="updateQty('${item.id}', 1)" aria-label="Increase quantity">&plus;</button>
                        </div>
                        <button class="cart-remove-btn" onclick="removeFromCart('${item.id}')" title="Remove item">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            <span>Remove</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    // If user does not have bundle in cart and has 2 or more books, suggest bundle upgrade
    const hasBundle = cart.some(i => i.id === 'complete-bundle-5');
    if (!hasBundle && getTotalItemCount() >= 2) {
        html += `
            <div class="cart-bundle-offer">
                <span class="cart-bundle-badge">Bundle & Save</span>
                <h5 class="cart-bundle-title">Get All 5 Books for R 680.00!</h5>
                <p class="cart-bundle-desc">Save R120 plus get FREE Nationwide Courier Delivery anywhere in South Africa.</p>
                <button class="cart-bundle-btn" onclick="addToCart('complete-bundle-5', 1, false); showToast('Bundle added!');">Upgrade to 5-Book Bundle</button>
            </div>
        `;
    }

    container.innerHTML = html;
}

function renderSummary() {
    const subtotalEl = document.getElementById('cartSubtotal');
    const shippingEl = document.getElementById('cartShipping');
    const totalEl = document.getElementById('cartTotal');
    const freeShippingProgress = document.getElementById('freeShippingProgressBar');
    const freeShippingText = document.getElementById('freeShippingText');
    const checkoutBtn = document.getElementById('cartCheckoutBtn');

    const subtotal = getSubtotal();
    const shipping = getShippingFee();
    const grandTotal = getGrandTotal();

    if (subtotalEl) subtotalEl.textContent = `R ${subtotal.toFixed(2)}`;
    if (shippingEl) {
        shippingEl.textContent = shipping === 0 ? 'FREE' : `R ${shipping.toFixed(2)}`;
        shippingEl.style.color = shipping === 0 ? '#1e6b47' : '#2d2a26';
        shippingEl.style.fontWeight = shipping === 0 ? '700' : '500';
    }
    if (totalEl) totalEl.textContent = `R ${grandTotal.toFixed(2)}`;

    // Free shipping threshold indicator
    if (freeShippingProgress && freeShippingText) {
        if (subtotal === 0) {
            freeShippingText.innerHTML = `🚚 <strong>Nationwide Courier Delivery:</strong> Free on orders over R 400.00!`;
            freeShippingProgress.style.width = '0%';
        } else if (subtotal >= PAYFAST_CONFIG.shipping.freeShippingThreshold || cart.some(i => i.id === 'complete-bundle-5')) {
            freeShippingText.innerHTML = `🎉 <strong>Congratulations!</strong> You qualify for <strong>FREE Nationwide Delivery</strong>!`;
            freeShippingProgress.style.width = '100%';
        } else {
            const remaining = PAYFAST_CONFIG.shipping.freeShippingThreshold - subtotal;
            const pct = Math.min(100, (subtotal / PAYFAST_CONFIG.shipping.freeShippingThreshold) * 100);
            freeShippingText.innerHTML = `Add <strong>R ${remaining.toFixed(2)}</strong> more to get <strong>FREE Nationwide Delivery</strong>!`;
            freeShippingProgress.style.width = `${pct}%`;
        }
    }

    if (checkoutBtn) {
        checkoutBtn.disabled = cart.length === 0;
        checkoutBtn.style.opacity = cart.length === 0 ? '0.5' : '1';
        checkoutBtn.style.cursor = cart.length === 0 ? 'not-allowed' : 'pointer';
    }
}

// Drawer Visibility
function openCartDrawer() {
    showCartView(); // reset to cart view
    const overlay = document.getElementById('cartOverlay');
    const drawer = document.getElementById('cartDrawer');
    if (overlay && drawer) {
        overlay.classList.add('active');
        drawer.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeCartDrawer() {
    const overlay = document.getElementById('cartOverlay');
    const drawer = document.getElementById('cartDrawer');
    if (overlay && drawer) {
        overlay.classList.remove('active');
        drawer.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

function toggleCartDrawer() {
    const drawer = document.getElementById('cartDrawer');
    if (drawer && drawer.classList.contains('active')) {
        closeCartDrawer();
    } else {
        openCartDrawer();
    }
}

function openCartFromMobile() {
    if (typeof closeMobileNav === 'function') {
        closeMobileNav();
    }
    setTimeout(openCartDrawer, 250);
}

// Switch between Cart and Checkout Views
function showCheckoutView() {
    if (cart.length === 0) {
        showToast('Your cart is empty');
        return;
    }
    const cartView = document.getElementById('cartStandardView');
    const checkoutView = document.getElementById('cartCheckoutView');
    if (cartView && checkoutView) {
        cartView.style.display = 'none';
        checkoutView.classList.add('active');

        // Update checkout amount summary
        const checkoutTotalDisplay = document.getElementById('checkoutTotalDisplay');
        if (checkoutTotalDisplay) {
            checkoutTotalDisplay.textContent = `R ${getGrandTotal().toFixed(2)}`;
        }
    }
}

function showCartView() {
    const cartView = document.getElementById('cartStandardView');
    const checkoutView = document.getElementById('cartCheckoutView');
    if (cartView && checkoutView) {
        cartView.style.display = 'flex';
        checkoutView.classList.remove('active');
    }
}

// Toast Feedback Notification
function showToast(msg) {
    let toast = document.getElementById('cartToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cartToast';
        toast.className = 'cart-toast';
        document.body.appendChild(toast);
    }

    toast.innerHTML = `
        <span>${msg}</span>
        <button class="cart-toast-btn" onclick="openCartDrawer()">View Cart</button>
    `;
    toast.classList.add('show');

    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3800);
}

// ==========================================================================
// 5. PAYFAST CHECKOUT DISPATCHER
// ==========================================================================
function processPayFastCheckout(event) {
    if (event) event.preventDefault();

    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }

    const form = document.getElementById('payfastCustomerForm');
    if (!form || !form.reportValidity()) {
        return;
    }

    const firstName = document.getElementById('custFirstName').value.trim();
    const lastName = document.getElementById('custLastName').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const address = document.getElementById('custAddress').value.trim();
    const suburb = document.getElementById('custSuburb').value.trim();
    const city = document.getElementById('custCity').value.trim();
    const province = document.getElementById('custProvince').value;
    const postalCode = document.getElementById('custPostalCode').value.trim();
    const notes = document.getElementById('custNotes').value.trim();

    // Unique South African Order Number (e.g., FLP-202611-4821)
    const orderNumber = 'FLP-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
    const grandTotal = getGrandTotal().toFixed(2);
    const itemCount = getTotalItemCount();
    const itemNames = cart.map(i => `${i.title} (x${i.qty})`).join(', ');

    const fullDeliveryAddress = `${address}, ${suburb}, ${city}, ${province}, ${postalCode}`;

    // Save order preview to localStorage for confirmation screen
    const orderData = {
        orderNumber: orderNumber,
        date: new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }),
        items: [...cart],
        subtotal: getSubtotal().toFixed(2),
        shipping: getShippingFee().toFixed(2),
        total: grandTotal,
        customer: {
            name: `${firstName} ${lastName}`,
            email: email,
            phone: phone,
            address: fullDeliveryAddress,
            notes: notes
        }
    };
    try {
        localStorage.setItem('flp_pending_order', JSON.stringify(orderData));
    } catch (e) {}

    // Build PayFast Form
    const payfastUrl = PAYFAST_CONFIG.sandbox
        ? 'https://sandbox.payfast.co.za/eng/process'
        : 'https://www.payfast.co.za/eng/process';

    const payfastForm = document.createElement('form');
    payfastForm.method = 'POST';
    payfastForm.action = payfastUrl;
    payfastForm.style.display = 'none';

    const fields = {
        merchant_id: PAYFAST_CONFIG.merchant_id,
        merchant_key: PAYFAST_CONFIG.merchant_key,
        return_url: PAYFAST_CONFIG.return_url + `&order=${orderNumber}&amount=${grandTotal}`,
        cancel_url: PAYFAST_CONFIG.cancel_url,
        notify_url: PAYFAST_CONFIG.notify_url,

        // Customer details
        name_first: firstName,
        name_last: lastName,
        email_address: email,
        cell_number: phone,

        // Transaction details
        m_payment_id: orderNumber,
        amount: grandTotal,
        item_name: `For Little People (${itemCount} Book${itemCount > 1 ? 's' : ''})`,
        item_description: itemNames.length > 250 ? itemNames.slice(0, 247) + '...' : itemNames,

        // Custom delivery fields for seller reference
        custom_str1: fullDeliveryAddress.length > 250 ? fullDeliveryAddress.slice(0, 247) + '...' : fullDeliveryAddress,
        custom_str2: notes.length > 250 ? notes.slice(0, 247) + '...' : notes,
        custom_int1: itemCount
    };

    // Add hidden input fields
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = value;
            payfastForm.appendChild(input);
        }
    }

    document.body.appendChild(payfastForm);

    // Show friendly loading state
    const submitBtn = document.getElementById('payfastSubmitBtn');
    if (submitBtn) {
        submitBtn.innerHTML = 'Connecting to PayFast Secure Gateway... 🔒';
        submitBtn.disabled = true;
    }

    // Submit form to PayFast
    payfastForm.submit();
}

// ==========================================================================
// 6. POST-PAYMENT RETURN HANDLER (SUCCESS / CANCELLED)
// ==========================================================================
function checkPaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const orderNumber = params.get('order') || 'FLP-ORDER';

    if (payment === 'success') {
        // Clear active cart
        clearCart();

        // Get saved order details
        let order = null;
        try {
            order = JSON.parse(localStorage.getItem('flp_pending_order'));
        } catch (e) {}

        const modal = document.getElementById('orderSuccessModal');
        const orderNumEl = document.getElementById('successOrderNumber');
        const orderSummaryEl = document.getElementById('successOrderSummary');

        if (orderNumEl) orderNumEl.textContent = order ? order.orderNumber : orderNumber;
        if (orderSummaryEl && order) {
            orderSummaryEl.innerHTML = `
                <div style="background:#fdfbf7; border:1px solid #ebd9c8; border-radius:14px; padding:16px; margin:20px 0; text-align:left;">
                    <div style="font-weight:700; color:#2d2a26; margin-bottom:8px;">Deliver to:</div>
                    <div style="color:#615a51; font-size:0.95rem; line-height:1.5;">${order.customer.name}<br>${order.customer.address}<br>Tel: ${order.customer.phone}</div>
                    <div style="font-weight:700; color:#2d2a26; margin-top:12px; border-top:1px dashed #ebd9c8; padding-top:8px; display:flex; justify-content:space-between;">
                        <span>Total Paid:</span>
                        <span style="color:#d87659;">R ${order.total}</span>
                    </div>
                </div>
            `;
        }

        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        // Clean URL query parameters
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (payment === 'cancelled') {
        showToast('Payment was cancelled. Your books are still saved in your cart.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('orderSuccessModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    loadCart();
    checkPaymentReturn();
});
