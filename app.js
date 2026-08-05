/**
 * GOLD-PLATINUM PAWN SYSTEM
 * Core Application Logic, State Management & Web Bluetooth ESC/POS Printing
 */

// Global State
const state = {
    records: [],
    settings: {
        shopName: "ហាងបញ្ចាំ មាស-ប្លាទីន សុខ ស៊ីណាត",
        shopPhone: "012 999 888 / 097 555 444",
        shopAddress: "ផ្លូវជាតិលេខ១ ភូមិព្រៃម្នាស់ ឃុំព្រៃម្នាស់ ស្រុកកណ្ដាលស្ទឹង ខេត្តកណ្ដាល",
        receiptFooter: "សូមអរគុណ! សូមរក្សាទុកវិក្កយបត្រនេះឱ្យបានល្អ។"
    },
    bluetooth: {
        device: null,
        characteristic: null,
        paperWidth: 58 // Default to 58mm for mobile receipt printers
    },
    activeTab: "dashboard",
    currentRecord: null // Used for view/edit/print operations
};

// Khmer Formatting Helpers
const KHMER_NUMBERS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
const KHMER_DAYS = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
const KHMER_MONTHS = [
    'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
    'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'
];

function toKhmerNumber(number) {
    if (number === null || number === undefined) return '';
    return number.toString().split('').map(char => {
        return isNaN(parseInt(char)) ? char : KHMER_NUMBERS[parseInt(char)];
    }).join('');
}

function formatKhmerDateTime(date) {
    const d = new Date(date);
    const dayName = KHMER_DAYS[d.getDay()];
    const day = toKhmerNumber(d.getDate());
    const monthName = KHMER_MONTHS[d.getMonth()];
    const year = toKhmerNumber(d.getFullYear() + 5443 - 543); // approximate Buddhist Era or standard Gregorian year in Khmer
    // Let's stick to Gregorian year but in Khmer characters
    const gregYear = toKhmerNumber(d.getFullYear());
    
    const hours = toKhmerNumber(String(d.getHours()).padStart(2, '0'));
    const minutes = toKhmerNumber(String(d.getMinutes()).padStart(2, '0'));
    const seconds = toKhmerNumber(String(d.getSeconds()).padStart(2, '0'));
    
    return `ថ្ងៃ${dayName} ទី${day} ខែ${monthName} ឆ្នាំ${gregYear} | ម៉ោង ${hours}:${minutes}:${seconds}`;
}

function formatKhmerDate(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    const day = toKhmerNumber(d.getDate());
    const month = toKhmerNumber(d.getMonth() + 1);
    const year = toKhmerNumber(d.getFullYear());
    return `${day}/${month}/${year}`;
}

function formatCurrency(amount, currency) {
    const formattedNum = Number(amount).toLocaleString('en-US');
    if (currency === 'រៀល' || currency === 'riel' || currency === '៛') {
        return toKhmerNumber(formattedNum) + ' ៛';
    } else {
        return '$' + formattedNum;
    }
}

// Weight Display Format
function formatWeight(chi, hun, ly) {
    return `${toKhmerNumber(chi || 0)} ជី ${toKhmerNumber(hun || 0)} ហ៊ុន ${toKhmerNumber(ly || 0)} លី`;
}

// Database Operations (Local Storage)
// Database Operations (Firebase Sync & Local Storage Cache)
const DB = {
    init() {
        // Load Settings fallback cache
        const savedSettings = localStorage.getItem('pawn_shop_settings');
        if (savedSettings) {
            state.settings = JSON.parse(savedSettings);
        } else {
            localStorage.setItem('pawn_shop_settings', JSON.stringify(state.settings));
        }

        // Load Records fallback cache
        const savedRecords = localStorage.getItem('pawn_records');
        if (savedRecords) {
            state.records = JSON.parse(savedRecords);
        } else {
            // Seed sample data if empty
            state.records = [
                {
                    id: "SN-0000001",
                    customerName: "សុខ សុភ័ក្ត្រ",
                    customerPhone: "012 777 666",
                    customerAddress: "ព្រៃម្នាស់",
                    itemType: "មាស",
                    itemDesc: "ខ្សែក",
                    weightChi: 1,
                    weightHun: 2,
                    weightLy: 0,
                    amount: 800000,
                    currency: "រៀល",
                    interestRate: 2000,
                    pawnDate: "2026-08-01",
                    dueDate: "2026-09-01",
                    status: "សកម្ម",
                    createdDate: "2026-08-01 10:15:30"
                },
                {
                    id: "SN-0000002",
                    customerName: "ចាន់ ធារ៉ា",
                    customerPhone: "098 123 456",
                    customerAddress: "សំឡី",
                    itemType: "ផ្លាកទីន",
                    itemDesc: "ចិញ្ចៀន",
                    weightChi: 0,
                    weightHun: 5,
                    weightLy: 5,
                    amount: 250,
                    currency: "ដុល្លារ",
                    interestRate: 2000,
                    pawnDate: "2026-07-15",
                    dueDate: "2026-08-15",
                    status: "សកម្ម",
                    createdDate: "2026-07-15 14:20:45"
                }
            ];
            localStorage.setItem('pawn_records', JSON.stringify(state.records));
        }

        // Initialize Real-time cloud sync with Firebase
        this.initFirebase();
    },

    initFirebase() {
        const firebaseConfig = {
            apiKey: "AIzaSyApBSgdTO5O5PkFT1EueYxHSL9ODNDZ8ZQ",
            authDomain: "psn-2026.firebaseapp.com",
            databaseURL: "https://psn-2026-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "psn-2026",
            storageBucket: "psn-2026.firebasestorage.app",
            messagingSenderId: "674039383293",
            appId: "1:674039383293:web:0b5aaa9736ef96b5452a94",
            measurementId: "G-M6MVGX2647"
        };

        try {
            // Initialize Firebase Compat
            firebase.initializeApp(firebaseConfig);
            window.firebaseDb = firebase.database();

            // 1. Sync Shop Settings
            window.firebaseDb.ref('pawn_shop_settings').on('value', (snapshot) => {
                const val = snapshot.val();
                if (val) {
                    state.settings = val;
                    localStorage.setItem('pawn_shop_settings', JSON.stringify(state.settings));
                    
                    // Sync UI text labels
                    document.getElementById('sidebar-shop-name').textContent = state.settings.shopName;
                    document.getElementById('topbar-shop-name').textContent = state.settings.shopName;
                    
                    // Prefill form fields if they are loaded
                    const settingsName = document.getElementById('settings-shop-name');
                    if (settingsName) settingsName.value = state.settings.shopName;
                    const settingsPhone = document.getElementById('settings-shop-phone');
                    if (settingsPhone) settingsPhone.value = state.settings.shopPhone;
                    const settingsAddr = document.getElementById('settings-shop-address');
                    if (settingsAddr) settingsAddr.value = state.settings.shopAddress;
                    const settingsFooter = document.getElementById('settings-receipt-footer');
                    if (settingsFooter) settingsFooter.value = state.settings.receiptFooter;
                } else {
                    // Bootstrap Firebase database if empty
                    window.firebaseDb.ref('pawn_shop_settings').set(state.settings);
                }
            });

            // 2. Sync Pawn Records
            window.firebaseDb.ref('pawn_records').on('value', (snapshot) => {
                const val = snapshot.val();
                if (val) {
                    state.records = val;
                    localStorage.setItem('pawn_records', JSON.stringify(state.records));
                    
                    // Trigger real-time UI rebuild across all machines
                    updateDashboardStats();
                    populateRecordsTable();
                    populateRecentPawnsTable();
                    populateRecentRedemptionsTable();
                } else {
                    // Bootstrap Firebase database if empty
                    if (state.records && state.records.length > 0) {
                        window.firebaseDb.ref('pawn_records').set(state.records);
                    }
                }
            });

        } catch (error) {
            console.error("Firebase database could not initialize. Running in Offline Cache mode.", error);
        }
    },

    saveRecords() {
        localStorage.setItem('pawn_records', JSON.stringify(state.records));
        
        // Sync to Firebase Cloud
        if (window.firebaseDb) {
            window.firebaseDb.ref('pawn_records').set(state.records);
        }
        
        updateDashboardStats();
        populateRecordsTable();
        populateRecentPawnsTable();
        populateRecentRedemptionsTable();
    },

    saveSettings() {
        localStorage.setItem('pawn_shop_settings', JSON.stringify(state.settings));
        
        // Sync to Firebase Cloud
        if (window.firebaseDb) {
            window.firebaseDb.ref('pawn_shop_settings').set(state.settings);
        }
        
        // Update all UI shop labels
        document.getElementById('sidebar-shop-name').textContent = state.settings.shopName;
        document.getElementById('topbar-shop-name').textContent = state.settings.shopName;
        
        const nameInput = document.getElementById('settings-shop-name');
        if (nameInput) nameInput.value = state.settings.shopName;
        const phoneInput = document.getElementById('settings-shop-phone');
        if (phoneInput) phoneInput.value = state.settings.shopPhone;
        const addrInput = document.getElementById('settings-shop-address');
        if (addrInput) addrInput.value = state.settings.shopAddress;
        const footerInput = document.getElementById('settings-receipt-footer');
        if (footerInput) footerInput.value = state.settings.receiptFooter;
    },

    generateNextSerial() {
        if (state.records.length === 0) return "SN-0000001";
        
        // Find highest serial number sequence
        let maxNum = 0;
        state.records.forEach(r => {
            const match = r.id.match(/^SN-(\d+)$/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxNum) maxNum = num;
            }
        });
        
        const nextNum = maxNum + 1;
        return "SN-" + String(nextNum).padStart(7, '0');
    }
};

// Update dashboard summary metrics
function updateDashboardStats() {
    // Current Active status records
    const activeRecords = state.records.filter(r => r.status === "សកម្ម");
    
    // Aggregates
    let totalPawners = activeRecords.length;
    let capitalRiel = 0;
    let capitalUsd = 0;
    let interestRiel = 0;

    activeRecords.forEach(r => {
        const capital = Number(r.amount) || 0;
        const dailyInterest = Number(r.interestRate) || 0;
        const monthlyInterest = dailyInterest * 30; // standard 1 month calculation

        if (r.currency === "រៀល") {
            capitalRiel += capital;
        } else {
            capitalUsd += capital;
        }
        interestRiel += monthlyInterest;
    });

    // Populate UI
    document.getElementById('stat-total-pawners').textContent = toKhmerNumber(totalPawners) + ' នាក់';
    document.getElementById('stat-capital-riel').textContent = formatCurrency(capitalRiel, 'រៀល');
    document.getElementById('stat-capital-usd').textContent = formatCurrency(capitalUsd, 'ដុល្លារ');
    document.getElementById('stat-interest-riel').textContent = formatCurrency(interestRiel, 'រៀល');
}

// View Controller (Tabs and Navigations)
const Navigation = {
    init() {
        const navItems = document.querySelectorAll('.nav-item, .mobile-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const tabId = item.getAttribute('data-tab');
                Navigation.switchTab(tabId);
            });
        });

        // Toggle mobile sidebar
        const toggleBtn = document.getElementById('menu-toggle-btn');
        const sidebar = document.querySelector('.sidebar');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                sidebar.classList.toggle('active');
            });
        }

        // Close sidebar on click inside nav items on mobile
        document.querySelectorAll('.sidebar .nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                sidebar.classList.remove('active');
            });
        });
    },

    switchTab(tabId) {
        state.activeTab = tabId;
        
        // Remove active class from all tabs & navigation buttons
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(btn => {
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Activate selected tab content
        const targetTab = document.getElementById('tab-' + tabId);
        if (targetTab) {
            targetTab.classList.add('active');
        }

        // Update top bar page title
        const titles = {
            'dashboard': 'ផ្ទាំងគ្រប់គ្រងប្រព័ន្ធ',
            'new-pawn': 'បញ្ចូលទិន្នន័យបញ្ចាំថ្មី',
            'pawn-list': 'បញ្ជីទិន្នន័យអ្នកបញ្ចាំទាំងអស់',
            'settings': 'កំណត់ម៉ាស៊ីនបោះពុម្ព និងហាង'
        };
        document.getElementById('page-title-text').textContent = titles[tabId] || 'ផ្ទាំងគ្រប់គ្រង';

        // Custom actions on switching tabs
        if (tabId === 'new-pawn') {
            resetNewPawnForm();
        }
    }
};

// Live Clock Initializer
function startLiveClocks() {
    function update() {
        const now = new Date();
        const khmerFormatted = formatKhmerDateTime(now);
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
        const dateStr = now.toLocaleDateString('km-KH');

        // Sidebar clock
        document.getElementById('sidebar-clock').textContent = toKhmerNumber(timeStr);
        
        // Topbar
        document.getElementById('top-time').textContent = toKhmerNumber(timeStr);
        document.getElementById('top-date').textContent = formatKhmerDate(now.toISOString().split('T')[0]);
        
        // Dashboard Hero
        const heroTime = document.getElementById('hero-time');
        const heroDate = document.getElementById('hero-date');
        if (heroTime) heroTime.textContent = toKhmerNumber(timeStr);
        if (heroDate) heroDate.textContent = khmerFormatted.split('|')[0].trim();
    }
    
    update();
    setInterval(update, 1000);
}

// ==========================================================================
// FORM VALIDATIONS & FORM TRIGGERS
// ==========================================================================

function initFormHandlers() {
    // Address dropdown "Other/ផ្សេងៗ" trigger
    setupDropdownCustomToggle('pawn-customer-address', 'pawn-customer-address-custom');
    setupDropdownCustomToggle('edit-customer-address', 'edit-customer-address-custom');

    // Description dropdown "Other/ផ្សេងៗ" trigger
    setupDropdownCustomToggle('pawn-item-desc', 'pawn-item-desc-custom');
    setupDropdownCustomToggle('edit-item-desc', 'edit-item-desc-custom');

    // Calculation updates on form inputs
    const formInputs = ['pawn-weight-chi', 'pawn-weight-hun', 'pawn-weight-ly', 'pawn-amount', 'pawn-interest-rate', 'pawn-currency'];
    formInputs.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) {
            elem.addEventListener('input', updateFormCalculations);
            elem.addEventListener('change', updateFormCalculations);
        }
    });

    // Form currency changing limits interest rate validation label
    // Currency select event listeners removed as Riel-only is enforced

    // Submit New Pawn
    const newForm = document.getElementById('new-pawn-form');
    if (newForm) {
        newForm.addEventListener('submit', handleNewPawnSubmit);
    }

    // Submit Edit Form
    const editForm = document.getElementById('edit-pawn-form');
    if (editForm) {
        editForm.addEventListener('submit', handleEditPawnSubmit);
    }

    // Clear Form Button
    const clearBtn = document.getElementById('btn-clear-form');
    if (clearBtn) {
        clearBtn.addEventListener('click', resetNewPawnForm);
    }

    // Add New Button inside pawn list tab
    document.getElementById('btn-tab-add-new').addEventListener('click', () => {
        Navigation.switchTab('new-pawn');
    });

    // Reset filters
    document.getElementById('btn-reset-filters').addEventListener('click', () => {
        document.getElementById('search-input').value = '';
        document.getElementById('filter-address').value = '';
        document.getElementById('filter-status').value = '';
        populateRecordsTable();
    });

    // Print records report
    document.getElementById('btn-print-records-report').addEventListener('click', printRecordsReport);

    // Filtering triggers
    ['search-input', 'filter-address', 'filter-status'].forEach(id => {
        document.getElementById(id).addEventListener('input', populateRecordsTable);
        document.getElementById(id).addEventListener('change', populateRecordsTable);
    });

    // Dashboard View All button
    document.getElementById('btn-view-all-dashboard').addEventListener('click', () => {
        Navigation.switchTab('pawn-list');
    });
}

function setupDropdownCustomToggle(selectId, customInputId) {
    const select = document.getElementById(selectId);
    const customInput = document.getElementById(customInputId);
    
    if (select && customInput) {
        select.addEventListener('change', () => {
            if (select.value === 'ផ្សេងៗ') {
                customInput.classList.remove('hidden');
                customInput.setAttribute('required', 'required');
            } else {
                customInput.classList.add('hidden');
                customInput.removeAttribute('required');
                customInput.value = '';
            }
        });
    }
}

function updateFormCalculations() {
    const chi = Number(document.getElementById('pawn-weight-chi').value) || 0;
    const hun = Number(document.getElementById('pawn-weight-hun').value) || 0;
    const ly = Number(document.getElementById('pawn-weight-ly').value) || 0;
    
    const dailyRate = Number(document.getElementById('pawn-interest-rate').value) || 0;
    const currency = document.getElementById('pawn-currency').value;
    
    // Auto calculate normalized weight formatting
    document.getElementById('calc-weight-text').textContent = formatWeight(chi, hun, ly);
    
    // Auto calculate monthly interest (Daily rate * 30 days)
    const monthlyRate = dailyRate * 30;
    document.getElementById('calc-monthly-interest').textContent = formatCurrency(monthlyRate, 'រៀល');
}

function resetNewPawnForm() {
    const form = document.getElementById('new-pawn-form');
    form.reset();
    
    // Restore dates
    const today = new Date().toISOString().split('T')[0];
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    const oneMonthLaterStr = oneMonthLater.toISOString().split('T')[0];
    
    document.getElementById('pawn-date').value = today;
    document.getElementById('pawn-due-date').value = oneMonthLaterStr;
    
    // Hide customs
    document.getElementById('pawn-customer-address-custom').classList.add('hidden');
    document.getElementById('pawn-customer-address-custom').removeAttribute('required');
    document.getElementById('pawn-item-desc-custom').classList.add('hidden');
    document.getElementById('pawn-item-desc-custom').removeAttribute('required');
    
    // Serial Number
    const nextSN = DB.generateNextSerial();
    document.getElementById('form-serial-number').textContent = nextSN;
    
    // Interest Rate defaults
    document.getElementById('pawn-currency').value = 'រៀល';
    document.getElementById('pawn-interest-rate').value = 500;
    document.getElementById('pawn-interest-rate').min = 500;
    document.getElementById('interest-rate-help').textContent = "ការប្រាក់ត្រូវបង្ហាញចាប់ពី ៥០០រៀល ឡើងទៅ";
    
    updateFormCalculations();
}

// Create New Pawn Action
function handleNewPawnSubmit(e) {
    e.preventDefault();
    
    const nextSN = DB.generateNextSerial();
    const customerName = document.getElementById('pawn-customer-name').value.trim();
    const customerPhone = document.getElementById('pawn-customer-phone').value.trim();
    
    // Address extraction
    const addrSelect = document.getElementById('pawn-customer-address').value;
    const customerAddress = addrSelect === 'ផ្សេងៗ' 
        ? document.getElementById('pawn-customer-address-custom').value.trim() 
        : addrSelect;
        
    const itemType = document.getElementById('pawn-item-type').value;
    
    // Description extraction
    const descSelect = document.getElementById('pawn-item-desc').value;
    const itemDesc = descSelect === 'ផ្សេងៗ' 
        ? document.getElementById('pawn-item-desc-custom').value.trim() 
        : descSelect;
        
    const weightChi = Number(document.getElementById('pawn-weight-chi').value) || 0;
    const weightHun = Number(document.getElementById('pawn-weight-hun').value) || 0;
    const weightLy = Number(document.getElementById('pawn-weight-ly').value) || 0;
    
    const amount = Number(document.getElementById('pawn-amount').value) || 0;
    const currency = document.getElementById('pawn-currency').value;
    const interestRate = Number(document.getElementById('pawn-interest-rate').value) || 0;
    
    const pawnDate = document.getElementById('pawn-date').value;
    const dueDate = document.getElementById('pawn-due-date').value;
    
    // Validation check for minimum interest
    if (interestRate < 500) {
        alert("កំហុស៖ ការប្រាក់ប្រចាំថ្ងៃត្រូវចាប់ពី ៥០០៛ ឡើងទៅ!");
        return;
    }

    const newRecord = {
        id: nextSN,
        customerName,
        customerPhone,
        customerAddress,
        itemType,
        itemDesc,
        weightChi,
        weightHun,
        weightLy,
        amount,
        currency,
        interestRate,
        pawnDate,
        dueDate,
        status: "សកម្ម",
        createdDate: new Date().toISOString().replace('T', ' ').split('.')[0]
    };
    
    state.records.push(newRecord);
    DB.saveRecords();
    
    alert(`រក្សាទុកទិន្នន័យរួចរាល់! លេខសម្គាល់៖ ${nextSN}`);
    
    // Prompt to view and print receipt immediately
    openDetailModal(newRecord);
    resetNewPawnForm();
}

// Edit Pawn Form prefill & submissions
function openEditModal(record) {
    state.currentRecord = record;
    
    document.getElementById('edit-pawn-id').value = record.id;
    document.getElementById('edit-serial-number').value = record.id;
    document.getElementById('edit-customer-name').value = record.customerName;
    document.getElementById('edit-customer-phone').value = record.customerPhone;
    
    // Select address handling
    const addrSelect = document.getElementById('edit-customer-address');
    const customAddrInput = document.getElementById('edit-customer-address-custom');
    
    const standardAddresses = ["ព្រៃម្នាស់", "ដូនណូយ", "សំឡី", "ស្វាយ", "ត្នោត", "ត្រោក", "ព្រៃរបឺស", "ពោធិ៍ម្អម", "ច្រេស", "ខ្សែត្រ"];
    if (standardAddresses.includes(record.customerAddress)) {
        addrSelect.value = record.customerAddress;
        customAddrInput.classList.add('hidden');
        customAddrInput.value = '';
    } else {
        addrSelect.value = "ផ្សេងៗ";
        customAddrInput.classList.remove('hidden');
        customAddrInput.value = record.customerAddress;
    }
    
    document.getElementById('edit-item-type').value = record.itemType;
    
    // Select Description handling
    const descSelect = document.getElementById('edit-item-desc');
    const customDescInput = document.getElementById('edit-item-desc-custom');
    const standardDescs = ["ខ្សែក", "ខ្សែដៃ", "ចិញ្ចៀន", "ក្រវិល", "កងដៃ"];
    if (standardDescs.includes(record.itemDesc)) {
        descSelect.value = record.itemDesc;
        customDescInput.classList.add('hidden');
        customDescInput.value = '';
    } else {
        descSelect.value = "ផ្សេងៗ";
        customDescInput.classList.remove('hidden');
        customDescInput.value = record.itemDesc;
    }
    
    document.getElementById('edit-weight-chi').value = record.weightChi;
    document.getElementById('edit-weight-hun').value = record.weightHun;
    document.getElementById('edit-weight-ly').value = record.weightLy;
    
    document.getElementById('edit-amount').value = record.amount;
    document.getElementById('edit-currency').value = record.currency;
    document.getElementById('edit-interest-rate').value = record.interestRate;
    
    document.getElementById('edit-date').value = record.pawnDate;
    document.getElementById('edit-due-date').value = record.dueDate;
    document.getElementById('edit-status').value = record.status;
    
    document.getElementById('edit-modal').classList.add('active');
}

function handleEditPawnSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('edit-pawn-id').value;
    const index = state.records.findIndex(r => r.id === id);
    
    if (index === -1) {
        alert("រកមិនឃើញទិន្នន័យដែលត្រូវកែប្រែ!");
        return;
    }
    
    const customerName = document.getElementById('edit-customer-name').value.trim();
    const customerPhone = document.getElementById('edit-customer-phone').value.trim();
    
    const addrSelect = document.getElementById('edit-customer-address').value;
    const customerAddress = addrSelect === 'ផ្សេងៗ' 
        ? document.getElementById('edit-customer-address-custom').value.trim() 
        : addrSelect;
        
    const itemType = document.getElementById('edit-item-type').value;
    
    const descSelect = document.getElementById('edit-item-desc').value;
    const itemDesc = descSelect === 'ផ្សេងៗ' 
        ? document.getElementById('edit-item-desc-custom').value.trim() 
        : descSelect;
        
    const weightChi = Number(document.getElementById('edit-weight-chi').value) || 0;
    const weightHun = Number(document.getElementById('edit-weight-hun').value) || 0;
    const weightLy = Number(document.getElementById('edit-weight-ly').value) || 0;
    
    const amount = Number(document.getElementById('edit-amount').value) || 0;
    const currency = document.getElementById('edit-currency').value;
    const interestRate = Number(document.getElementById('edit-interest-rate').value) || 0;
    
    const pawnDate = document.getElementById('edit-date').value;
    const dueDate = document.getElementById('edit-due-date').value;
    const status = document.getElementById('edit-status').value;
    
    // Validation check for minimum interest
    if (interestRate < 500) {
        alert("កំហុស៖ ការប្រាក់ប្រចាំថ្ងៃត្រូវចាប់ពី ៥០០៛ ឡើងទៅ!");
        return;
    }
    
    // Update
    state.records[index] = {
        ...state.records[index],
        customerName,
        customerPhone,
        customerAddress,
        itemType,
        itemDesc,
        weightChi,
        weightHun,
        weightLy,
        amount,
        currency,
        interestRate,
        pawnDate,
        dueDate,
        status
    };
    
    DB.saveRecords();
    
    // Close modal
    document.getElementById('edit-modal').classList.remove('active');
    alert("កែប្រែទិន្នន័យបញ្ចាំដោយជោគជ័យ!");
}

function deleteRecord(id) {
    if (confirm(`តើអ្នកពិតជាចង់លុបកំណត់ត្រា ${id} នេះមែនទេ? សកម្មភាពនេះមិនអាចត្រឡប់វិញបានឡើយ!`)) {
        state.records = state.records.filter(r => r.id !== id);
        DB.saveRecords();
        alert("លុបកំណត់ត្រារួចរាល់!");
    }
}

// ==========================================================================
// POPULATE TABLES & RENDER VIEWS
// ==========================================================================

function populateRecordsTable() {
    const listBody = document.getElementById('pawn-records-list');
    if (!listBody) return;
    
    listBody.innerHTML = '';
    
    const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
    const filterAddr = document.getElementById('filter-address').value;
    const filterStat = document.getElementById('filter-status').value;
    
    // Filtering logic
    const filtered = state.records.filter(r => {
        const matchesSearch = r.customerName.toLowerCase().includes(searchQuery) ||
                             r.customerPhone.includes(searchQuery) ||
                             r.id.toLowerCase().includes(searchQuery);
                             
        const matchesAddress = filterAddr === '' || 
                              (filterAddr === 'ផ្សេងៗ' && !["ព្រៃម្នាស់", "ដូនណូយ", "សំឡី", "ស្វាយ", "ត្នោត", "ត្រោក", "ព្រៃរបឺស", "ពោធិ៍ម្អម", "ច្រេស", "ខ្សែត្រ"].includes(r.customerAddress)) ||
                              r.customerAddress === filterAddr;
                              
        const matchesStatus = filterStat === '' || r.status === filterStat;
        
        return matchesSearch && matchesAddress && matchesStatus;
    });

    // Render Rows
    if (filtered.length === 0) {
        listBody.innerHTML = `<tr><td colspan="11" class="text-center py-4">រកមិនឃើញទិន្នន័យអ្នកបញ្ចាំទេ</td></tr>`;
        return;
    }
    
    // Sort descending by SN
    filtered.sort((a,b) => b.id.localeCompare(a.id));
    
    filtered.forEach(r => {
        const tr = document.createElement('tr');
        
        let statusBadge = `<span class="badge badge-active">សកម្ម</span>`;
        if (r.status === 'បានលោះ') statusBadge = `<span class="badge badge-redeemed">បានលោះ</span>`;
        if (r.status === 'ហួសកំណត់') statusBadge = `<span class="badge badge-overdue">ហួសកំណត់</span>`;
        
        tr.innerHTML = `
            <td style="font-family:'Inter'; font-weight:600; color:var(--gold);">${r.id}</td>
            <td style="font-weight: 500;">${r.customerName}</td>
            <td style="font-family:'Inter';">${r.customerPhone}</td>
            <td>${r.customerAddress}</td>
            <td>${r.itemType} (${r.itemDesc})</td>
            <td>${formatWeight(r.weightChi, r.weightHun, r.weightLy)}</td>
            <td style="font-weight:600;" class="${r.currency === 'រៀល' ? 'text-riel' : 'text-usd'}">${formatCurrency(r.amount, r.currency)}</td>
            <td style="font-family:'Inter';">${formatCurrency(r.interestRate, r.currency)}</td>
            <td>${formatKhmerDate(r.pawnDate)} - ${formatKhmerDate(r.dueDate)}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="actions-cell">
                    <button class="action-btn" title="បោះពុម្ពវិក្កយបត្រ" onclick="printReceiptDirectly('${r.id}')">
                        <i class="fa-solid fa-print"></i>
                    </button>
                    <button class="action-btn action-btn-borrow" title="ខ្ចីប្រាក់បន្ថែម" onclick="borrowMoreDirectly('${r.id}')" ${r.status === 'បានលោះ' ? 'disabled' : ''}>
                        <i class="fa-solid fa-hand-holding-dollar"></i>
                    </button>
                    <button class="action-btn action-btn-redeem" title="ទូទាត់លោះគ្រឿងបញ្ចាំ" onclick="redeemDirectly('${r.id}')" ${r.status === 'បានលោះ' ? 'disabled' : ''}>
                        <i class="fa-solid fa-handshake"></i>
                    </button>
                    <button class="action-btn" title="កែប្រែ" onclick="editRecordDirectly('${r.id}')">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="action-btn action-btn-danger" title="លុប" onclick="deleteRecordDirectly('${r.id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        listBody.appendChild(tr);
    });
}

function populateRecentPawnsTable() {
    const body = document.getElementById('recent-pawns-list');
    if (!body) return;
    
    body.innerHTML = '';
    
    // Sort and get top 5 recent records
    const sorted = [...state.records].sort((a,b) => b.createdDate.localeCompare(a.createdDate)).slice(0, 5);
    
    if (sorted.length === 0) {
        body.innerHTML = `<tr><td colspan="9" class="text-center py-4">មិនទាន់មានទិន្នន័យបញ្ចាំនៅឡើយទេ</td></tr>`;
        return;
    }
    
    sorted.forEach(r => {
        const tr = document.createElement('tr');
        
        let statusBadge = `<span class="badge badge-active">សកម្ម</span>`;
        if (r.status === 'បានលោះ') statusBadge = `<span class="badge badge-redeemed">បានលោះ</span>`;
        if (r.status === 'ហួសកំណត់') statusBadge = `<span class="badge badge-overdue">ហួសកំណត់</span>`;
        
        tr.innerHTML = `
            <td style="font-family:'Inter'; font-weight:600; color:var(--gold);">${r.id}</td>
            <td style="font-weight: 500;">${r.customerName}</td>
            <td style="font-family:'Inter';">${r.customerPhone}</td>
            <td>${r.customerAddress}</td>
            <td>${r.itemType} (${r.itemDesc})</td>
            <td>${formatWeight(r.weightChi, r.weightHun, r.weightLy)}</td>
            <td style="font-weight:600;" class="${r.currency === 'រៀល' ? 'text-riel' : 'text-usd'}">${formatCurrency(r.amount, r.currency)}</td>
            <td>${formatKhmerDate(r.pawnDate)}</td>
            <td>${statusBadge}</td>
        `;
        body.appendChild(tr);
    });
}

function populateRecentRedemptionsTable() {
    const body = document.getElementById('recent-redemptions-list');
    if (!body) return;
    
    body.innerHTML = '';
    
    // Filter redeemed records
    const redeemed = state.records.filter(r => r.status === 'បានលោះ');
    
    if (redeemed.length === 0) {
        body.innerHTML = `<tr><td colspan="9" class="text-center py-4">មិនទាន់មានប្រវត្តិលោះនៅឡើយទេ</td></tr>`;
        return;
    }
    
    // Sort descending by redeemedDate (fallback to id)
    redeemed.sort((a,b) => {
        const dateA = a.redeemedDate || '';
        const dateB = b.redeemedDate || '';
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return b.id.localeCompare(a.id);
    });
    
    // Show top 5 recent redemptions
    const recentRedeemed = redeemed.slice(0, 5);
    
    recentRedeemed.forEach(r => {
        const tr = document.createElement('tr');
        
        // Compute interest if redeemedInterest is not stored on legacy records
        let interestPaid = r.redeemedInterest;
        if (interestPaid === undefined) {
            const pawnDate = new Date(r.pawnDate);
            const end = r.redeemedDate ? new Date(r.redeemedDate) : new Date();
            pawnDate.setHours(0,0,0,0);
            end.setHours(0,0,0,0);
            const diffTime = Math.abs(end - pawnDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const daysCharged = diffDays <= 0 ? 1 : diffDays;
            interestPaid = r.interestRate * daysCharged;
        }
        
        const redemptionDateStr = r.redeemedDate ? formatKhmerDate(r.redeemedDate) : '---';
        const interestPaidStr = formatCurrency(interestPaid, 'រៀល');
        
        tr.innerHTML = `
            <td style="font-family:'Inter'; font-weight:600; color:var(--gold);">${r.id}</td>
            <td style="font-weight: 500;">${r.customerName}</td>
            <td style="font-family:'Inter';">${r.customerPhone}</td>
            <td>${r.itemType} (${r.itemDesc})</td>
            <td style="font-weight:600;" class="${r.currency === 'រៀល' ? 'text-riel' : 'text-usd'}">${formatCurrency(r.amount, r.currency)}</td>
            <td style="font-weight:600; color:var(--danger);">${interestPaidStr}</td>
            <td>${formatKhmerDate(r.pawnDate)}</td>
            <td style="font-weight:500; color:var(--success);">${redemptionDateStr}</td>
            <td><span class="badge badge-redeemed">បានលោះ</span></td>
        `;
        body.appendChild(tr);
    });
}

// Global click delegation proxies since functions inside modules need standard global scopes for HTML onclick attributes
window.printReceiptDirectly = function(id) {
    const record = state.records.find(r => r.id === id);
    if (record) openDetailModal(record);
};

window.editRecordDirectly = function(id) {
    const record = state.records.find(r => r.id === id);
    if (record) openEditModal(record);
};

window.deleteRecordDirectly = function(id) {
    deleteRecord(id);
};

window.borrowMoreDirectly = function(id) {
    const record = state.records.find(r => r.id === id);
    if (record) openBorrowMoreModal(record);
};

window.redeemDirectly = function(id) {
    const record = state.records.find(r => r.id === id);
    if (record) openRedeemModal(record);
};

// Settings handling
function initSettingsForm() {
    const form = document.getElementById('shop-settings-form');
    if (form) {
        // Pre-fill
        document.getElementById('settings-shop-name').value = state.settings.shopName;
        document.getElementById('settings-shop-phone').value = state.settings.shopPhone;
        document.getElementById('settings-shop-address').value = state.settings.shopAddress;
        document.getElementById('settings-receipt-footer').value = state.settings.receiptFooter;
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            state.settings.shopName = document.getElementById('settings-shop-name').value.trim();
            state.settings.shopPhone = document.getElementById('settings-shop-phone').value.trim();
            state.settings.shopAddress = document.getElementById('settings-shop-address').value.trim();
            state.settings.receiptFooter = document.getElementById('settings-receipt-footer').value.trim();
            
            DB.saveSettings();
            alert("រក្សាទុកព័ត៌មានហាងដោយជោគជ័យ!");
        });
        
        // Backup CSV button
        const backupBtn = document.getElementById('btn-backup-csv');
        if (backupBtn) {
            backupBtn.addEventListener('click', backupToCSV);
        }
        
        // Restore CSV buttons
        const triggerRestoreBtn = document.getElementById('btn-trigger-restore-csv');
        const fileInput = document.getElementById('file-restore-csv');
        if (triggerRestoreBtn && fileInput) {
            triggerRestoreBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', handleCSVRestore);
        }

        // Change System Password Form submission
        const passwordForm = document.getElementById('system-password-form');
        if (passwordForm) {
            passwordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const oldPw = document.getElementById('settings-old-password').value;
                const newPw = document.getElementById('settings-new-password').value;
                const confirmPw = document.getElementById('settings-confirm-password').value;
                
                const currentPassword = state.settings.systemPassword || "1234";
                
                if (oldPw !== currentPassword) {
                    alert("លេខកូដសម្ងាត់ចាស់មិនត្រឹមត្រូវឡើយ!");
                    return;
                }
                
                if (newPw.length < 4) {
                    alert("លេខកូដសម្ងាត់ថ្មីត្រូវតែមានយ៉ាងតិច ៤ ខ្ទង់!");
                    return;
                }
                
                if (newPw !== confirmPw) {
                    alert("លេខកូដសម្ងាត់ថ្មីទាំងពីរមិនដូចគ្នាឡើយ!");
                    return;
                }
                
                state.settings.systemPassword = newPw;
                DB.saveSettings();
                
                alert("បានផ្លាស់ប្តូរលេខកូដសម្ងាត់ប្រព័ន្ធដោយជោគជ័យ!");
                passwordForm.reset();
            });
        }
    }
}

// Lock Screen PIN System
// Lock Screen Password System
function initLockScreen() {
    const lockScreen = document.getElementById('lock-screen');
    if (!lockScreen) return;
    
    // Set default settings password to APP2026@OEMSOK if absent or legacy
    if (!state.settings.systemPassword || state.settings.systemPassword === "1234") {
        state.settings.systemPassword = "APP2026@OEMSOK";
        DB.saveSettings();
    }
    
    const pwdInput = document.getElementById('login-password-input');
    const toggleBtn = document.getElementById('btn-toggle-login-pwd');
    const submitBtn = document.getElementById('btn-login-submit');
    
    if (toggleBtn && pwdInput) {
        toggleBtn.addEventListener('click', () => {
            const type = pwdInput.getAttribute('type') === 'password' ? 'text' : 'password';
            pwdInput.setAttribute('type', type);
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
            }
        });
    }
    
    function submitPassword() {
        if (!pwdInput) return;
        const enteredPassword = pwdInput.value;
        const correctPassword = state.settings.systemPassword || "APP2026@OEMSOK";
        
        if (enteredPassword === correctPassword) {
            lockScreen.classList.add('unlocked');
            pwdInput.value = "";
            
            // Start the idle timer on successful unlock
            resetIdleTimer();
        } else {
            // Shake card for feedback
            const card = lockScreen.querySelector('.lock-card');
            if (card) {
                card.classList.add('shake');
                setTimeout(() => card.classList.remove('shake'), 400);
            }
            pwdInput.focus();
        }
    }
    
    if (submitBtn) {
        submitBtn.addEventListener('click', submitPassword);
    }
    
    if (pwdInput) {
        pwdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                submitPassword();
            }
        });
        
        // Auto-focus on password field
        setTimeout(() => pwdInput.focus(), 500);
    }
    
    // Setup activity listeners to reset timer
    const activityEvents = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach(evt => {
        document.addEventListener(evt, resetIdleTimer, { capture: true, passive: true });
    });
}

// Idle Auto Logout System
let idleTimer = null;

function resetIdleTimer() {
    const lockScreen = document.getElementById('lock-screen');
    if (!lockScreen || !lockScreen.classList.contains('unlocked')) {
        // If locked, we don't start or reset the idle timer
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        return;
    }
    
    clearTimeout(idleTimer);
    idleTimer = setTimeout(logoutSystem, 60000); // 1 minute (60 seconds)
}

function logoutSystem() {
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen && lockScreen.classList.contains('unlocked')) {
        lockScreen.classList.remove('unlocked');
        
        // Clear login input
        const pwdInput = document.getElementById('login-password-input');
        if (pwdInput) {
            pwdInput.value = "";
            pwdInput.setAttribute('type', 'password');
            const toggleBtn = document.getElementById('btn-toggle-login-pwd');
            if (toggleBtn) {
                const icon = toggleBtn.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-eye';
            }
            setTimeout(() => pwdInput.focus(), 500);
        }
    }
    
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
}

function backupToCSV() {
    if (state.records.length === 0) {
        alert("មិនមានទិន្នន័យអ្នកបញ្ចាំដើម្បីចម្លងទុកឡើយ!");
        return;
    }
    
    // Headers list matching the fields
    const headers = [
        "លេខសម្គាល់ (ID)",
        "ឈ្មោះអ្នកបញ្ចាំ (Name)",
        "លេខទូរសព្ទ (Phone)",
        "អាសយដ្ឋាន (Address)",
        "ប្រភេទគ្រឿងបញ្ចាំ (Item Type)",
        "សម្គាល់គ្រឿងបញ្ចាំ (Item Description)",
        "ទម្ងន់ ជី (Chi)",
        "ទម្ងន់ ហ៊ុន (Hun)",
        "ទម្ងន់ លី (Ly)",
        "ប្រាក់ខ្ចី (Capital Amount)",
        "រូបិយប័ណ្ណ (Currency)",
        "ការប្រាក់ក្នុង១ថ្ងៃ (Daily Interest)",
        "ថ្ងៃបញ្ចាំ (Pawn Date)",
        "ថ្ងៃកំណត់លោះ (Due Date)",
        "ស្ថានភាព (Status)",
        "ថ្ងៃបង្កើត (Created Date)",
        "កំណត់សម្គាល់ (Notes)",
        "ថ្ងៃលោះវិញ (Redemption Date)",
        "ការប្រាក់សរុបដែលបានបង់ (Redemption Interest Paid)"
    ];
    
    const fields = [
        "id", "customerName", "customerPhone", "customerAddress", 
        "itemType", "itemDesc", "weightChi", "weightHun", "weightLy", 
        "amount", "currency", "interestRate", "pawnDate", "dueDate", 
        "status", "createdDate", "notes", "redeemedDate", "redeemedInterest"
    ];
    
    // Helper to escape values for CSV compatibility
    const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        let str = String(val);
        // Replace single double-quote with two double-quotes
        str = str.replace(/"/g, '""');
        // Wrap in quotes if it contains comma, double-quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            str = `"${str}"`;
        }
        return str;
    };
    
    // Build CSV Content with UTF-8 BOM so Excel opens Khmer characters correctly!
    let csvContent = '\uFEFF'; 
    csvContent += headers.map(escapeCSV).join(',') + '\r\n';
    
    state.records.forEach(r => {
        const row = fields.map(field => escapeCSV(r[field]));
        csvContent += row.join(',') + '\r\n';
    });
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `Pawn_Backup_${today}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function parseCSV(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;
    
    // Remove BOM if present
    if (text.startsWith('\uFEFF')) {
        text = text.substring(1);
    }
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        
        if (inQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    // Escaped quote
                    row[row.length - 1] += '"';
                    i++; // skip next quote
                } else {
                    // Ending quote
                    inQuotes = false;
                }
            } else {
                row[row.length - 1] += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push("");
            } else if (char === '\r' || char === '\n') {
                // End of row
                lines.push(row);
                row = [""];
                // Handle CRLF pairs: if current is \r and next is \n, skip \n
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
            } else {
                row[row.length - 1] += char;
            }
        }
    }
    // Push last row if not empty
    if (row.length > 1 || row[0] !== "") {
        lines.push(row);
    }
    return lines;
}

function handleCSVRestore(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const text = evt.target.result;
            const rows = parseCSV(text);
            
            if (rows.length < 2) {
                alert("ឯកសារ .CSV គ្មានទិន្នន័យ ឬខុសទម្រង់កំណត់ឡើយ!");
                return;
            }
            
            // Header is rows[0]. Data rows start at index 1.
            const parsedRecords = [];
            const fields = [
                "id", "customerName", "customerPhone", "customerAddress", 
                "itemType", "itemDesc", "weightChi", "weightHun", "weightLy", 
                "amount", "currency", "interestRate", "pawnDate", "dueDate", 
                "status", "createdDate", "notes", "redeemedDate", "redeemedInterest"
            ];
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                // Skip empty lines at end of CSV
                if (row.length === 1 && row[0] === "") continue;
                
                const rec = {};
                fields.forEach((field, colIdx) => {
                    let val = row[colIdx] !== undefined ? row[colIdx].trim() : '';
                    
                    // Convert numeric values
                    if (["weightChi", "weightHun", "weightLy", "amount", "interestRate", "redeemedInterest"].includes(field)) {
                        val = val === '' ? 0 : Number(val) || 0;
                    }
                    rec[field] = val;
                });
                
                // Simple validation: must have ID and Name
                if (rec.id && rec.customerName) {
                    parsedRecords.push(rec);
                }
            }
            
            if (parsedRecords.length === 0) {
                alert("មិនអាចស្វែងរកទិន្នន័យអ្នកបញ្ចាំដែលមានសុពលភាពឡើយ!");
                return;
            }
            
            if (confirm(`បានរកឃើញទិន្នន័យអ្នកបញ្ចាំចំនួន ${parsedRecords.length} នាក់។ តើលោកអ្នកពិតជាចង់ជំនួសទិន្នន័យបច្ចុប្បន្នទាំងអស់ដោយទិន្នន័យថ្មីនេះមែនទេ?`)) {
                state.records = parsedRecords;
                DB.saveRecords();
                alert("បានស្ដារទិន្នន័យដោយជោគជ័យ!");
                
                // Switch to dashboard to reflect changes immediately
                Navigation.switchTab('dashboard');
                
                // Clear file input
                e.target.value = '';
            }
        } catch (err) {
            console.error(err);
            alert("មានបញ្ហាក្នុងការអានឯកសារ .CSV: " + err.message);
        }
    };
    reader.readAsText(file, 'utf-8');
}

function printRecordsReport() {
    const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
    const filterAddr = document.getElementById('filter-address').value;
    const filterStat = document.getElementById('filter-status').value;
    
    // Filter records
    const filtered = state.records.filter(r => {
        const matchesSearch = r.customerName.toLowerCase().includes(searchQuery) ||
                             r.customerPhone.includes(searchQuery) ||
                             r.id.toLowerCase().includes(searchQuery);
                             
        const matchesAddress = filterAddr === '' || 
                              (filterAddr === 'ផ្សេងៗ' && !["ព្រៃម្នាស់", "ដូនណូយ", "សំឡី", "ស្វាយ", "ត្នោត", "ត្រោក", "ព្រៃរបឺស", "ពោធិ៍ម្អម", "ច្រេស", "ខ្សែត្រ"].includes(r.customerAddress)) ||
                              r.customerAddress === filterAddr;
                              
        const matchesStatus = filterStat === '' || r.status === filterStat;
        
        return matchesSearch && matchesAddress && matchesStatus;
    });
    
    // Sort descending by ID
    filtered.sort((a,b) => b.id.localeCompare(a.id));
    
    // Calculate aggregates for the printed header
    let totalRiel = 0;
    let totalUsd = 0;
    let totalInterest = 0;
    filtered.forEach(r => {
        if (r.status === 'សកម្ម') {
            if (r.currency === 'រៀល') {
                totalRiel += Number(r.amount) || 0;
            } else {
                totalUsd += Number(r.amount) || 0;
            }
            totalInterest += (Number(r.interestRate) || 0) * 30;
        }
    });
    
    const todayStr = formatKhmerDateTime(new Date());
    
    // Build beautiful report HTML
    let tableRows = '';
    filtered.forEach(r => {
        const weightStr = formatWeight(r.weightChi, r.weightHun, r.weightLy);
        const amountStr = formatCurrency(r.amount, r.currency);
        const dailyInterestStr = formatCurrency(r.interestRate, 'រៀល');
        const pawnDateStr = formatKhmerDate(r.pawnDate);
        const dueDateStr = formatKhmerDate(r.dueDate);
        
        tableRows += `
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px; font-family:'Inter'; text-align:center;">${r.id}</td>
                <td style="padding: 8px; font-weight:500;">${r.customerName}</td>
                <td style="padding: 8px; font-family:'Inter'; text-align:center;">${r.customerPhone}</td>
                <td style="padding: 8px;">${r.customerAddress}</td>
                <td style="padding: 8px;">${r.itemType} (${r.itemDesc})</td>
                <td style="padding: 8px; font-size:11px;">${weightStr}</td>
                <td style="padding: 8px; font-weight:600; text-align:right;">${amountStr}</td>
                <td style="padding: 8px; text-align:right;">${dailyInterestStr}</td>
                <td style="padding: 8px; font-size:11px; text-align:center;">${pawnDateStr} - ${dueDateStr}</td>
                <td style="padding: 8px; text-align:center; font-weight:bold;">${r.status}</td>
            </tr>
        `;
    });
    
    const reportHTML = `
        <div style="font-family:'Kantumruy Pro', sans-serif; padding: 20px; color:#000; background-color:#fff;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="margin: 0; font-size: 22px; color: #000;">${state.settings.shopName}</h1>
                <p style="margin: 5px 0; font-size: 13px;">ទូរសព្ទ៖ ${state.settings.shopPhone} | អាសយដ្ឋាន៖ ${state.settings.shopAddress}</p>
                <h2 style="margin: 15px 0 5px 0; font-size: 18px; text-decoration: underline; color: #000;">របាយការណ៍បញ្ជីទិន្នន័យអ្នកបញ្ចាំ</h2>
                <p style="margin: 0; font-size: 11px; color:#555;">កាលបរិច្ឆេទបោះពុម្ព៖ ${todayStr}</p>
            </div>
            
            <!-- Filter Summary -->
            <div style="margin-bottom: 20px; font-size: 12px; display:flex; justify-content:space-between; border-bottom:1px solid #ccc; padding-bottom:10px;">
                <div>
                    <strong>តម្រងស្វែងរក៖</strong> ${document.getElementById('search-input').value || 'ទាំងអស់'} | 
                    <strong>អាសយដ្ឋាន៖</strong> ${document.getElementById('filter-address').value || 'ទាំងអស់'} | 
                    <strong>ស្ថានភាព៖</strong> ${document.getElementById('filter-status').value || 'ទាំងអស់'}
                </div>
                <div>
                    <strong>រកឃើញសរុប៖</strong> ${filtered.length} នាក់
                </div>
            </div>
            
            <!-- Aggregates Stats Box -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; border: 1px solid #000; padding: 15px; border-radius: 8px; margin-bottom: 25px; background-color:#f9f9f9; font-size: 13px;">
                <div style="text-align: center; border-right: 1px solid #ddd;">
                    <p style="margin: 0; color:#555;">ចំនួនអ្នកបញ្ចាំ</p>
                    <h3 style="margin: 5px 0 0 0; font-size: 16px;">${toKhmerNumber(filtered.length)} នាក់</h3>
                </div>
                <div style="text-align: center; border-right: 1px solid #ddd;">
                    <p style="margin: 0; color:#555;">ដើមទុនបញ្ចាំ (រៀល)</p>
                    <h3 style="margin: 5px 0 0 0; font-size: 16px; color:#000;">${formatCurrency(totalRiel, 'រៀល')}</h3>
                </div>
                <div style="text-align: center; border-right: 1px solid #ddd;">
                    <p style="margin: 0; color:#555;">ដើមទុនបញ្ចាំ (ដុល្លារ)</p>
                    <h3 style="margin: 5px 0 0 0; font-size: 16px; color:#000;">${formatCurrency(totalUsd, 'ដុល្លារ')}</h3>
                </div>
                <div style="text-align: center;">
                    <p style="margin: 0; color:#555;">ការប្រាក់រំពឹងទុក/ខែ</p>
                    <h3 style="margin: 5px 0 0 0; font-size: 16px; color:#000;">${formatCurrency(totalInterest, 'រៀល')}</h3>
                </div>
            </div>
            
            <!-- Table -->
            <table style="width:100%; border-collapse: collapse; font-size: 11px; margin-bottom: 40px;">
                <thead>
                    <tr style="background-color: #f1f1f1; border-top: 2px solid #000; border-bottom: 2px solid #000;">
                        <th style="padding: 10px 8px; text-align:center;">លេខសម្គាល់</th>
                        <th style="padding: 10px 8px; text-align:left;">ឈ្មោះអ្នកបញ្ចាំ</th>
                        <th style="padding: 10px 8px; text-align:center;">លេខទូរសព្ទ</th>
                        <th style="padding: 10px 8px; text-align:left;">អាសយដ្ឋាន</th>
                        <th style="padding: 10px 8px; text-align:left;">គ្រឿងបញ្ចាំ</th>
                        <th style="padding: 10px 8px; text-align:left;">ទម្ងន់</th>
                        <th style="padding: 10px 8px; text-align:right;">ប្រាក់ខ្ចី</th>
                        <th style="padding: 10px 8px; text-align:right;">ការប្រាក់/ថ្ងៃ</th>
                        <th style="padding: 10px 8px; text-align:center;">ថ្ងៃបញ្ចាំ - លោះ</th>
                        <th style="padding: 10px 8px; text-align:center;">ស្ថានភាព</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            
            <!-- Signature Footer -->
            <div style="display:flex; justify-content:space-between; text-align:center; font-size:12px; margin-top:50px;">
                <div style="width: 200px;">
                    <p style="font-weight: 600;">ហត្ថលេខាអ្នករៀបចំរបាយការណ៍</p>
                    <div style="height:60px;"></div>
                </div>
                <div style="width: 200px;">
                    <p style="font-weight: 600;">ហត្ថលេខាម្ចាស់ហាង</p>
                    <div style="height:60px;"></div>
                </div>
            </div>
        </div>
    `;
    
    // Inject and trigger browser print dialog
    const printContainer = document.getElementById('print-receipt-container');
    printContainer.className = 'report-print';
    printContainer.innerHTML = reportHTML;
    window.print();
}

// ==========================================================================
// RECEIPT GENERATORS (SYSTEM LAYOUT RENDERER)
// ==========================================================================

function buildSystemReceiptHTML(record, isPreview = true) {
    const totalWeight = formatWeight(record.weightChi, record.weightHun, record.weightLy);
    const borrowedStr = formatCurrency(record.amount, record.currency);
    const dailyInterestStr = formatCurrency(record.interestRate, 'រៀល');
    const monthlyInterestStr = formatCurrency(record.interestRate * 30, 'រៀល');
    const pawnDateStr = formatKhmerDate(record.pawnDate);
    const dueDateStr = formatKhmerDate(record.dueDate);
    
    // COPY 1: Full details
    const copy1 = `
        <div class="receipt-card receipt-card-copy1">
            <div class="receipt-card-header" style="text-align: center;">
                <img src="logo.jpg" alt="Logo" style="width: 45px; height: 45px; object-fit: cover; border-radius: 50%; margin-bottom: 4px; display: inline-block; border: 1px solid #d4af37;" />
                <h2>${state.settings.shopName}</h2>
                <p><i class="fa-solid fa-phone"></i> ទូរសព្ទ៖ ${state.settings.shopPhone}</p>
                <p><i class="fa-solid fa-location-dot"></i> អាសយដ្ឋាន៖ ${state.settings.shopAddress}</p>
                <span class="copy-badge">ច្បាប់ដើម (សម្រាប់អតិថិជន)</span>
            </div>
            <div class="receipt-grid">
                <div class="receipt-row"><span>លេខសម្គាល់៖</span><strong>${record.id}</strong></div>
                <div class="receipt-row"><span>ឈ្មោះអ្នកបញ្ចាំ៖</span><strong>${record.customerName}</strong></div>
                <div class="receipt-row"><span>លេខទូរសព្ទ៖</span><strong>${record.customerPhone}</strong></div>
                <div class="receipt-row"><span>អាសយដ្ឋាន៖</span><strong>${record.customerAddress}</strong></div>
                
                <div class="receipt-row"><span>គ្រឿងបញ្ចាំ៖</span><strong>${record.itemType} (${record.itemDesc})</strong></div>
                <div class="receipt-row"><span>ទម្ងន់៖</span><strong>${totalWeight}</strong></div>
                
                <div class="receipt-row"><span>ថ្ងៃបញ្ចាំ៖</span><strong>${pawnDateStr}</strong></div>
                <div class="receipt-row"><span>ថ្ងៃកំណត់លោះ៖</span><strong>${dueDateStr}</strong></div>
            </div>
            
            <div class="receipt-totals">
                <div class="receipt-total-row"><span>ចំនួនប្រាក់ខ្ចី៖</span><strong>${borrowedStr}</strong></div>
                <div class="receipt-total-row"><span>ការប្រាក់ក្នុង១ថ្ងៃ៖</span><strong>${dailyInterestStr}</strong></div>
                <div class="receipt-total-row" style="color:var(--gold); border-top:1px dashed #ccc; padding-top:4px; margin-top:4px;">
                    <span>ការប្រាក់ក្នុង១ខែ (៣០ថ្ងៃ)៖</span><strong>${monthlyInterestStr}</strong>
                </div>
            </div>
            

            <div class="receipt-card-footer">
                ${state.settings.receiptFooter}
            </div>
        </div>
    `;

    // COPY 2: Summary details (large ID/SN)
    const copy2 = `
        <div class="receipt-card receipt-card-copy2">
            <div class="receipt-card-header" style="text-align: center;">
                <img src="logo.jpg" alt="Logo" style="width: 45px; height: 45px; object-fit: cover; border-radius: 50%; margin-bottom: 4px; display: inline-block; border: 1px solid #d4af37;" />
                <h2>${state.settings.shopName}</h2>
                <p><i class="fa-solid fa-phone"></i> ទូរសព្ទ៖ ${state.settings.shopPhone}</p>
                <p><i class="fa-solid fa-location-dot"></i> អាសយដ្ឋាន៖ ${state.settings.shopAddress}</p>
                <span class="copy-badge">ច្បាប់ចម្លង (សម្រាប់ហាងរក្សាទុក)</span>
            </div>
            
            <div class="big-sn">${record.id}</div>
            
            <div class="receipt-grid">
                <div class="receipt-row"><span>ឈ្មោះអ្នកបញ្ចាំ៖</span><strong>${record.customerName}</strong></div>
                <div class="receipt-row"><span>លេខទូរសព្ទ៖</span><strong>${record.customerPhone}</strong></div>
                <div class="receipt-row"><span>ប្រាក់ខ្ចីចំនួន៖</span><strong style="font-size:14px; text-decoration:underline;">${borrowedStr}</strong></div>
                <div class="receipt-row"><span>ថ្ងៃខែឆ្នាំបញ្ចាំ៖</span><strong>${pawnDateStr}</strong></div>
            </div>
            

            <div class="receipt-card-footer">
                ${state.settings.receiptFooter}
            </div>
        </div>
    `;

    return copy1 + (isPreview ? '<div class="canvas-separator">សន្លឹកទី២ (ច្បាប់សង្ខេប)</div>' : '') + copy2;
}

// Modal View Details Manager
function openDetailModal(record) {
    state.currentRecord = record;
    
    // Render standard system HTML into preview
    const previewContainer = document.getElementById('system-print-wrapper-preview');
    previewContainer.innerHTML = buildSystemReceiptHTML(record, true);
    
    // Draw canvases for bluetooth
    drawBluetoothCanvases(record);
    
    // Update Bluetooth status indicator inside Modal
    updateModalBluetoothStatus();
    
    // Reset view tab to default (System print)
    setModalTab('system');
    
    document.getElementById('detail-modal').classList.add('active');
}

function updateModalBluetoothStatus() {
    const banner = document.getElementById('modal-bluetooth-status');
    if (state.bluetooth.characteristic) {
        banner.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> បានភ្ជាប់ទៅម៉ាស៊ីនបោះពុម្ព Bluetooth រួចរាល់។ អាចបោះពុម្ពបាន!`;
        banner.style.backgroundColor = 'rgba(46, 196, 182, 0.08)';
        banner.style.borderColor = 'var(--success)';
    } else {
        banner.innerHTML = `<i class="fa-solid fa-bluetooth text-primary"></i> មិនទាន់បានភ្ជាប់ Bluetooth Printer ទេ! <a href="#" id="modal-link-to-settings">ទៅកាន់ការកំណត់ដើម្បីភ្ជាប់</a>`;
        banner.style.backgroundColor = 'rgba(231, 29, 54, 0.08)';
        banner.style.borderColor = 'var(--danger)';
        
        // Settings link click helper
        const link = document.getElementById('modal-link-to-settings');
        if (link) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('detail-modal').classList.remove('active');
                Navigation.switchTab('settings');
            });
        }
    }
}

function setModalTab(type) {
    const btnSystem = document.getElementById('btn-tab-preview-system');
    const btnBt = document.getElementById('btn-tab-preview-bluetooth');
    const panelSystem = document.getElementById('preview-panel-system');
    const panelBt = document.getElementById('preview-panel-bluetooth');
    const executeBtn = document.getElementById('btn-modal-execute-print');

    if (type === 'system') {
        btnSystem.classList.add('active');
        btnBt.classList.remove('active');
        panelSystem.classList.remove('hidden');
        panelBt.classList.add('hidden');
        executeBtn.innerHTML = `<i class="fa-solid fa-print"></i> បោះពុម្ពវិក្កយបត្រ (System)`;
    } else {
        btnSystem.classList.remove('active');
        btnBt.classList.add('active');
        panelSystem.classList.add('hidden');
        panelBt.classList.remove('hidden');
        executeBtn.innerHTML = `<i class="fa-solid fa-bluetooth"></i> បោះពុម្ពតាម Bluetooth`;
    }
}

// ==========================================================================
// BORROW MORE (ខ្ចីថែម) & REDEEM (លោះវិញ) OPERATIONS
// ==========================================================================

function openBorrowMoreModal(record) {
    state.currentRecord = record;
    
    document.getElementById('borrow-more-id').value = record.id;
    document.getElementById('borrow-more-sn').textContent = record.id;
    document.getElementById('borrow-more-customer-name').textContent = record.customerName;
    document.getElementById('borrow-more-customer-phone').textContent = record.customerPhone;
    
    document.getElementById('borrow-more-current-amount').textContent = formatCurrency(record.amount, record.currency);
    document.getElementById('borrow-more-current-interest').textContent = formatCurrency(record.interestRate, 'រៀល');
    
    document.getElementById('borrow-more-currency-label').textContent = record.currency;
    document.getElementById('borrow-more-add-amount').value = '';
    document.getElementById('borrow-more-new-rate').value = '';
    
    // Set default borrow-more date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('borrow-more-date').value = today;
    
    document.getElementById('borrow-more-modal').classList.add('active');
}

function updateBorrowMoreCalculations() {
    const record = state.currentRecord;
    if (!record) return;
    
    const addAmount = Number(document.getElementById('borrow-more-add-amount').value) || 0;
    const currentAmount = Number(record.amount) || 0;
    const currentRate = Number(record.interestRate) || 0;
    
    if (currentAmount > 0) {
        const newTotal = currentAmount + addAmount;
        const newRate = currentRate * (newTotal / currentAmount);
        
        // Round to nearest integer for Riel
        const roundedRate = Math.round(newRate);
            
        document.getElementById('borrow-more-new-rate').value = roundedRate;
    }
}

function handleBorrowMoreSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('borrow-more-id').value;
    const index = state.records.findIndex(r => r.id === id);
    if (index === -1) return;
    
    const record = state.records[index];
    const addAmount = Number(document.getElementById('borrow-more-add-amount').value) || 0;
    const newRate = Number(document.getElementById('borrow-more-new-rate').value) || 0;
    const borrowDate = document.getElementById('borrow-more-date').value;
    
    if (addAmount <= 0) {
        alert("សូមវាយបញ្ចូលចំនួនប្រាក់ខ្ចីបន្ថែមត្រឹមត្រូវ!");
        return;
    }
    
    // Calculate new interest rate validation check
    if (newRate < 500) {
        alert("កំហុស៖ ការប្រាក់ប្រចាំថ្ងៃថ្មីជារៀលត្រូវចាប់ពី ៥០០៛ ឡើងទៅ!");
        return;
    }
    
    // Update record
    const prevAmount = record.amount;
    record.amount += addAmount;
    record.interestRate = newRate;
    record.pawnDate = borrowDate; // Reset cycle start to top-up date
    
    // Update due date to 1 month from this top-up date
    const d = new Date(borrowDate);
    d.setMonth(d.getMonth() + 1);
    record.dueDate = d.toISOString().split('T')[0];
    
    // Add transaction log
    record.notes = (record.notes || '') + `\n[ខ្ចីថែម] ខ្ចីបន្ថែមចំនួន ${formatCurrency(addAmount, record.currency)} នៅថ្ងៃ ${formatKhmerDate(borrowDate)} (ដើមសរុបថ្មី៖ ${formatCurrency(record.amount, record.currency)})`;
    
    DB.saveRecords();
    
    // Close modal
    document.getElementById('borrow-more-modal').classList.remove('active');
    alert(`បានខ្ចីបន្ថែមចំនួន ${formatCurrency(addAmount, record.currency)} ដោយជោគជ័យ!`);
    
    // Open print preview for the updated contract
    openDetailModal(record);
}

function openRedeemModal(record) {
    state.currentRecord = record;
    
    document.getElementById('redeem-id').value = record.id;
    document.getElementById('redeem-sn').textContent = record.id;
    document.getElementById('redeem-customer-name').textContent = record.customerName;
    document.getElementById('redeem-customer-phone').textContent = record.customerPhone;
    document.getElementById('redeem-item-name').textContent = `${record.itemType} (${record.itemDesc})`;
    
    // Calculate days elapsed from pawnDate to today
    const pawnDate = new Date(record.pawnDate);
    const today = new Date();
    
    // Reset hours to get exact calendar date difference
    pawnDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    
    const diffTime = today - pawnDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Charge minimum 1 day interest if same-day redemption
    const daysCharged = diffDays <= 0 ? 1 : diffDays;
    
    const interestDue = record.interestRate * daysCharged;
    const totalDue = record.amount + interestDue;
    
    document.getElementById('redeem-pawn-date').textContent = formatKhmerDate(record.pawnDate);
    document.getElementById('redeem-date-text').textContent = formatKhmerDate(today.toISOString().split('T')[0]);
    document.getElementById('redeem-days-elapsed').textContent = `${toKhmerNumber(daysCharged)} ថ្ងៃ`;
    
    document.getElementById('redeem-capital-amount').textContent = formatCurrency(record.amount, record.currency);
    document.getElementById('redeem-daily-rate').textContent = formatCurrency(record.interestRate, 'រៀល');
    document.getElementById('redeem-interest-due').textContent = formatCurrency(interestDue, 'រៀល');
    
    if (record.currency === 'រៀល') {
        const totalDue = record.amount + interestDue;
        document.getElementById('redeem-total-due').textContent = formatCurrency(totalDue, 'រៀល');
    } else {
        const capitalStr = formatCurrency(record.amount, 'ដុល្លារ');
        const interestStr = formatCurrency(interestDue, 'រៀល');
        document.getElementById('redeem-total-due').textContent = `${capitalStr} + ${interestStr}`;
    }
    
    document.getElementById('redeem-modal').classList.add('active');
}

function handleRedeemSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('redeem-id').value;
    const index = state.records.findIndex(r => r.id === id);
    if (index === -1) return;
    
    const record = state.records[index];
    
    // Calculate and store interest paid & redemption date
    const pawnDate = new Date(record.pawnDate);
    const today = new Date();
    pawnDate.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    const diffTime = today - pawnDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const daysCharged = diffDays <= 0 ? 1 : diffDays;
    const interestDue = record.interestRate * daysCharged;
    
    const todayStr = today.toISOString().split('T')[0];
    
    record.status = "បានលោះ";
    record.redeemedDate = todayStr;
    record.redeemedInterest = interestDue;
    
    // Add transaction log
    record.notes = (record.notes || '') + `\n[បានលោះ] បានទូទាត់លោះវិញរួចរាល់នៅថ្ងៃ ${formatKhmerDate(todayStr)} (ការប្រាក់បង់សរុប៖ ${formatCurrency(interestDue, 'រៀល')})`;
    
    DB.saveRecords();
    
    document.getElementById('redeem-modal').classList.remove('active');
    alert(`ទូទាត់លោះគ្រឿងបញ្ចាំ ${record.id} រួចរាល់ដោយជោគជ័យ!`);
}

function initModalHandlers() {
    // Tab switching inside modal
    document.getElementById('btn-tab-preview-system').addEventListener('click', () => setModalTab('system'));
    document.getElementById('btn-tab-preview-bluetooth').addEventListener('click', () => setModalTab('bluetooth'));
    
    // Close modal
    const closeBtns = [
        'btn-close-detail-modal', 'btn-modal-cancel', 
        'btn-close-edit-modal', 'btn-close-edit-modal-btn',
        'btn-close-borrow-more-modal', 'btn-cancel-borrow-more',
        'btn-close-redeem-modal', 'btn-cancel-redeem'
    ];
    closeBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                document.getElementById('detail-modal').classList.remove('active');
                document.getElementById('edit-modal').classList.remove('active');
                document.getElementById('borrow-more-modal').classList.remove('active');
                document.getElementById('redeem-modal').classList.remove('active');
            });
        }
    });

    // Borrow more form calculations update
    document.getElementById('borrow-more-add-amount').addEventListener('input', updateBorrowMoreCalculations);

    // Form submits for new modals
    document.getElementById('borrow-more-form').addEventListener('submit', handleBorrowMoreSubmit);
    document.getElementById('redeem-form').addEventListener('submit', handleRedeemSubmit);

    // Execute Print Button
    document.getElementById('btn-modal-execute-print').addEventListener('click', () => {
        const activeTabBtn = document.querySelector('.modal-tab-btn.active');
        const printType = activeTabBtn.id.includes('system') ? 'system' : 'bluetooth';
        
        if (printType === 'system') {
            executeSystemPrint();
        } else {
            executeBluetoothPrint();
        }
    });
}

// System print triggers browser window print dialog
function executeSystemPrint() {
    if (!state.currentRecord) return;
    
    const printContainer = document.getElementById('print-receipt-container');
    printContainer.className = 'receipt-print';
    printContainer.innerHTML = buildSystemReceiptHTML(state.currentRecord, false);
    
    window.print();
}

// ==========================================================================
// BLUETOOTH CANVAS receipt RENDERER (Supports perfect Khmer rendering)
// ==========================================================================

function drawBluetoothCanvases(record) {
    const width = state.bluetooth.paperWidth === 80 ? 576 : 384;
    
    const canvas1 = document.getElementById('bluetooth-receipt-canvas-1');
    const canvas2 = document.getElementById('bluetooth-receipt-canvas-2');
    
    renderReceiptToCanvas(canvas1, record, 1, width);
    renderReceiptToCanvas(canvas2, record, 2, width);
}

function renderReceiptToCanvas(canvas, record, copyNumber, width, isSecondPass = false) {
    const ctx = canvas.getContext('2d');
    
    if (!isSecondPass) {
        // Set static width. Height is estimated dynamically first.
        canvas.width = width;
        
        // Initial estimation of height to ensure size compatibility
        let calculatedHeight = copyNumber === 1 ? 750 : 580;
        canvas.height = calculatedHeight;
    }
    
    // Clear styling
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Text drawing contexts
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    
    let y = 15;
    
    // Header
    ctx.font = 'bold 20px "Kantumruy Pro", sans-serif';
    drawCenteredText(ctx, state.settings.shopName, width, y);
    y += 28;
    
    ctx.font = '13px "Kantumruy Pro", sans-serif';
    drawCenteredText(ctx, `ទូរសព្ទ៖ ${state.settings.shopPhone}`, width, y);
    y += 18;
    
    // Draw wrapped address text
    y = drawWrappedText(ctx, `អាសយដ្ឋាន៖ ${state.settings.shopAddress}`, 15, y, width - 30, 18);
    
    const copyLabel = copyNumber === 1 ? "ច្បាប់ដើម (សម្រាប់អតិថិជន)" : "ច្បាប់ចម្លង (សម្រាប់ហាង)";
    ctx.font = 'italic bold 11px "Kantumruy Pro", sans-serif';
    drawCenteredText(ctx, `--- ${copyLabel} ---`, width, y);
    y += 20;
    
    // Draw divider line
    drawDottedLine(ctx, 10, y, width - 10);
    y += 15;
    
    ctx.font = '14px "Kantumruy Pro", sans-serif';
    
    if (copyNumber === 1) {
        // Copy 1 standard full items
        const grid = [
            ["លេខសម្គាល់៖", record.id, "", ""],
            ["ឈ្មោះអ្នកបញ្ចាំ៖", record.customerName, "លេខទូរសព្ទ៖", record.customerPhone],
            ["អាសយដ្ឋាន៖", record.customerAddress, "", ""],
            ["គ្រឿងបញ្ចាំ៖", `${record.itemType} (${record.itemDesc})`, "ទម្ងន់សរុប៖", formatWeight(record.weightChi, record.weightHun, record.weightLy)],
            ["ថ្ងៃបញ្ចាំ៖", formatKhmerDate(record.pawnDate), "ថ្ងៃលោះ៖", formatKhmerDate(record.dueDate)]
        ];
        
        grid.forEach(row => {
            if (row[2] === "" && row[3] === "") {
                // Full row
                ctx.font = '13px "Kantumruy Pro", sans-serif';
                ctx.fillText(row[0], 15, y);
                ctx.font = 'bold 13px "Kantumruy Pro", sans-serif';
                ctx.fillText(row[1], 100, y);
                y += 20;
            } else {
                // Two column grid
                ctx.font = '13px "Kantumruy Pro", sans-serif';
                ctx.fillText(row[0], 15, y);
                ctx.font = 'bold 13px "Kantumruy Pro", sans-serif';
                ctx.fillText(row[1], 95, y);
                
                ctx.font = '13px "Kantumruy Pro", sans-serif';
                ctx.fillText(row[2], width / 2 + 5, y);
                ctx.font = 'bold 13px "Kantumruy Pro", sans-serif';
                ctx.fillText(row[3], width / 2 + 75, y);
                y += 20;
            }
        });
        
        y += 10;
        drawDottedLine(ctx, 10, y, width - 10);
        y += 15;
        
        // Calculations section
        ctx.font = 'bold 14px "Kantumruy Pro", sans-serif';
        ctx.fillText("ទឹកប្រាក់ខ្ចីសរុប៖", 15, y);
        drawRightText(ctx, formatCurrency(record.amount, record.currency), width - 15, y);
        y += 22;
        
        ctx.font = '13px "Kantumruy Pro", sans-serif';
        ctx.fillText("ការប្រាក់ប្រចាំថ្ងៃ៖", 15, y);
        drawRightText(ctx, formatCurrency(record.interestRate, 'រៀល'), width - 15, y);
        y += 22;
        
        ctx.font = 'bold 15px "Kantumruy Pro", sans-serif';
        ctx.fillText("ការប្រាក់ត្រូវបង់ក្នុង១ខែ៖", 15, y);
        drawRightText(ctx, formatCurrency(record.interestRate * 30, 'រៀល'), width - 15, y);
        y += 30;
        
    } else {
        // Copy 2 (Big SN and key details only)
        ctx.font = 'bold 36px "Inter", sans-serif';
        drawCenteredText(ctx, record.id, width, y);
        y += 48;
        
        ctx.font = '14px "Kantumruy Pro", sans-serif';
        
        ctx.fillText("ឈ្មោះអ្នកបញ្ចាំ៖", 15, y);
        ctx.font = 'bold 14px "Kantumruy Pro", sans-serif';
        drawRightText(ctx, record.customerName, width - 15, y);
        y += 24;
        
        ctx.font = '14px "Kantumruy Pro", sans-serif';
        ctx.fillText("លេខទូរសព្ទ៖", 15, y);
        ctx.font = 'bold 14px "Kantumruy Pro", sans-serif';
        drawRightText(ctx, record.customerPhone, width - 15, y);
        y += 24;
        
        ctx.font = 'bold 16px "Kantumruy Pro", sans-serif';
        ctx.fillText("ចំនួនទឹកប្រាក់ខ្ចី៖", 15, y);
        drawRightText(ctx, formatCurrency(record.amount, record.currency), width - 15, y);
        y += 28;
        
        ctx.font = '14px "Kantumruy Pro", sans-serif';
        ctx.fillText("ថ្ងៃខែឆ្នាំបញ្ចាំ៖", 15, y);
        ctx.font = 'bold 14px "Kantumruy Pro", sans-serif';
        drawRightText(ctx, formatKhmerDate(record.pawnDate), width - 15, y);
        y += 24;
    }
    
    drawDottedLine(ctx, 10, y, width - 10);
    y += 15;
    
    // Signatures removed as per user preference
    y += 10;
    
    // Footer message
    ctx.font = 'italic 11px "Kantumruy Pro", sans-serif';
    y = drawWrappedText(ctx, state.settings.receiptFooter, 15, y, width - 30, 16, true);
    y += 20; // safe padding at bottom
    
    // Resize height dynamically to match contents if needed, and re-render
    if (!isSecondPass && Math.abs(canvas.height - y) > 5) {
        canvas.height = y;
        // Re-render again with exact heights
        renderReceiptToCanvas(canvas, record, copyNumber, width, true);
    }
}

// Canvas utility helper functions
function drawCenteredText(ctx, text, width, y) {
    ctx.font = ctx.font;
    const textWidth = ctx.measureText(text).width;
    ctx.fillText(text, (width - textWidth) / 2, y);
}

function drawRightText(ctx, text, rightX, y) {
    const textWidth = ctx.measureText(text).width;
    ctx.fillText(text, rightX - textWidth, y);
}

function drawDottedLine(ctx, startX, y, endX) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
    ctx.setLineDash([]); // Reset
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, isCenter = false) {
    const words = text.split(' ');
    let line = '';
    
    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            if (isCenter) {
                drawCenteredText(ctx, line.trim(), maxWidth + 2 * x, y);
            } else {
                ctx.fillText(line.trim(), x, y);
            }
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    
    if (isCenter) {
        drawCenteredText(ctx, line.trim(), maxWidth + 2 * x, y);
    } else {
        ctx.fillText(line.trim(), x, y);
    }
    
    return y + lineHeight;
}

// ==========================================================================
// WEB BLUETOOTH API PRINT ENGINE
// ==========================================================================

function initBluetooth() {
    const connectBtn = document.getElementById('btn-connect-printer');
    const disconnectBtn = document.getElementById('btn-disconnect-printer');
    const testPrintBtn = document.getElementById('btn-test-print');
    
    if (connectBtn) {
        connectBtn.addEventListener('click', connectToBluetoothPrinter);
    }
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectPrinter);
    }
    if (testPrintBtn) {
        testPrintBtn.addEventListener('click', printTestPage);
    }
    
    // Paper Width change triggers canvas resize
    const paperRadios = document.querySelectorAll('input[name="printerPaperSize"]');
    paperRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.bluetooth.paperWidth = parseInt(e.target.value);
            if (state.currentRecord) {
                drawBluetoothCanvases(state.currentRecord);
            }
        });
    });
}

async function connectToBluetoothPrinter() {
    const connectBtn = document.getElementById('btn-connect-printer');
    
    try {
        console.log('Requesting Bluetooth Device...');
        
        // Most portable receipt printers advertise either generic serial SPP or basic printer service
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
                '00001101-0000-1000-8000-00805f9b34fb', // RFCOMM Serial Service
                '0000e7e1-0000-1000-8000-00805f9b34fb', // Custom printer UUID
                '0000ff00-0000-1000-8000-00805f9b34fb'  // Another common custom UUID
            ]
        });

        connectBtn.disabled = true;
        connectBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> កំពុងភ្ជាប់...`;

        console.log('Connecting to GATT Server...');
        const server = await device.gatt.connect();

        // Discover and find writable characteristics
        let characteristic = null;
        const services = await server.getPrimaryServices();
        
        for (const service of services) {
            console.log('Discovered Service:', service.uuid);
            const chars = await service.getCharacteristics();
            for (const char of chars) {
                console.log('Characteristic UUID:', char.uuid, 'Properties:', char.properties);
                if (char.properties.write || char.properties.writeWithoutResponse) {
                    characteristic = char;
                    break;
                }
            }
            if (characteristic) break;
        }

        // If no characteristic discovered yet, try defaults
        if (!characteristic) {
            // Force connection using standard printer characteristic
            const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
        }

        state.bluetooth.device = device;
        state.bluetooth.characteristic = characteristic;

        // Save device listeners
        device.addEventListener('gattserverdisconnected', onPrinterDisconnected);

        // Update UI
        updatePrinterUI(true, device.name);
        alert(`បានភ្ជាប់ជោគជ័យទៅកាន់ម៉ាស៊ីនបោះពុម្ព៖ ${device.name}`);
        
    } catch (error) {
        console.error('Bluetooth connection failed:', error);
        alert('កំហុស៖ មិនអាចភ្ជាប់ទៅកាន់ម៉ាស៊ីនបោះពុម្ពបានទេ។ ' + error.message);
        updatePrinterUI(false);
    }
}

function onPrinterDisconnected() {
    alert("ការតភ្ជាប់ទៅកាន់ម៉ាស៊ីនបោះពុម្ពត្រូវបានផ្ដាច់!");
    updatePrinterUI(false);
}

function disconnectPrinter() {
    if (state.bluetooth.device && state.bluetooth.device.gatt.connected) {
        state.bluetooth.device.gatt.disconnect();
    }
    updatePrinterUI(false);
}

function updatePrinterUI(isConnected, deviceName = "") {
    const indicator = document.getElementById('printer-status-indicator');
    const statusText = document.getElementById('printer-status-text');
    const infoBox = document.getElementById('connected-printer-info');
    const connectBtn = document.getElementById('btn-connect-printer');
    const disconnectBtn = document.getElementById('btn-disconnect-printer');
    const testPrintBtn = document.getElementById('btn-test-print');
    const deviceNameSpan = document.getElementById('printer-device-name');

    if (isConnected) {
        indicator.className = 'status-indicator connected';
        statusText.textContent = 'បានភ្ជាប់រួចរាល់';
        deviceNameSpan.textContent = deviceName;
        infoBox.classList.remove('hidden');
        connectBtn.classList.add('hidden');
        disconnectBtn.classList.remove('hidden');
        testPrintBtn.removeAttribute('disabled');
    } else {
        state.bluetooth.device = null;
        state.bluetooth.characteristic = null;
        
        indicator.className = 'status-indicator disconnected';
        statusText.textContent = 'មិនទាន់បានភ្ជាប់';
        infoBox.classList.add('hidden');
        connectBtn.classList.remove('hidden');
        connectBtn.disabled = false;
        connectBtn.innerHTML = `<i class="fa-solid fa-bluetooth"></i> ស្វែងរក និងភ្ជាប់ Bluetooth Printer`;
        disconnectBtn.classList.add('hidden');
        testPrintBtn.setAttribute('disabled', 'disabled');
    }
    
    // Sync modal banner if it's currently open
    updateModalBluetoothStatus();
}

async function printTestPage() {
    if (!state.bluetooth.characteristic) return;
    
    try {
        const initCmd = new Uint8Array([0x1B, 0x40]); // ESC @ (Init)
        const lineFeed = new Uint8Array([0x0A, 0x0A]);
        
        // Print basic ASCII text
        const encoder = new TextEncoder();
        const testText = encoder.encode(
            "================================\n" +
            "      GOLD & PLATINUM PAWN      \n" +
            "       PRINTER TEST OK!         \n" +
            "================================\n"
        );
        
        await writeToPrinter(initCmd);
        await writeToPrinter(testText);
        await writeToPrinter(lineFeed);
        
        alert("បានផ្ញើទិន្នន័យតេស្តទៅម៉ាស៊ីនបោះពុម្ព!");
    } catch (e) {
        alert("ការបោះពុម្ពសាកល្បងបានបរាជ័យ៖ " + e.message);
    }
}

// ESC/POS Canvas Raster Commands Compilation & Writing
async function executeBluetoothPrint() {
    if (!state.bluetooth.characteristic) {
        alert("សូមភ្ជាប់ Bluetooth Printer ជាមុនសិន!");
        return;
    }
    
    try {
        const canvas1 = document.getElementById('bluetooth-receipt-canvas-1');
        const canvas2 = document.getElementById('bluetooth-receipt-canvas-2');
        
        // Compile bitmap ESC/POS commands
        const data1 = compileESCPOSRasterFromCanvas(canvas1);
        const data2 = compileESCPOSRasterFromCanvas(canvas2);
        
        const initCmd = new Uint8Array([0x1B, 0x40]); // Initialize
        const feedCutCmd = new Uint8Array([0x1D, 0x56, 0x42, 0x00, 0x0A, 0x0A, 0x0A]); // Feed and cut / feed space
        
        // Write Copy 1
        await writeToPrinter(initCmd);
        await writeToPrinter(data1);
        await writeToPrinter(feedCutCmd);
        
        // Write Copy 2
        await writeToPrinter(initCmd);
        await writeToPrinter(data2);
        await writeToPrinter(feedCutCmd);
        
        alert("បានបោះពុម្ពវិក្កយបត្ររួចរាល់!");
    } catch (e) {
        console.error('Bluetooth Print Execution failed:', e);
        alert("បរាជ័យក្នុងការបោះពុម្ព៖ " + e.message);
    }
}

function compileESCPOSRasterFromCanvas(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, width, height).data;
    
    // ESC/POS GS v 0 command bytes
    // Command structure: GS v 0 m xL xH yL yH d1...dk
    // Width in bytes is width / 8.
    const widthBytes = width / 8;
    const xL = widthBytes & 0xFF;
    const xH = (widthBytes >> 8) & 0xFF;
    const yL = height & 0xFF;
    const yH = (height >> 8) & 0xFF;
    
    const header = new Uint8Array([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
    const dataSize = widthBytes * height;
    const buffer = new Uint8Array(header.length + dataSize);
    
    // Copy header
    buffer.set(header, 0);
    
    // Compile pixel bits (1 = black, 0 = white)
    let offset = header.length;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < widthBytes; x++) {
            let byteVal = 0;
            
            for (let bit = 0; bit < 8; bit++) {
                const pixelX = (x * 8) + bit;
                const pixelIdx = ((y * width) + pixelX) * 4;
                
                const r = imgData[pixelIdx];
                const g = imgData[pixelIdx + 1];
                const b = imgData[pixelIdx + 2];
                const a = imgData[pixelIdx + 3];
                
                // If transparent or light, count as white. Else black
                const threshold = 127;
                let isBlack = false;
                
                if (a > 128) {
                    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                    if (luma < threshold) isBlack = true;
                }
                
                if (isBlack) {
                    byteVal |= (1 << (7 - bit));
                }
            }
            
            buffer[offset++] = byteVal;
        }
    }
    
    return buffer;
}

// Writes large binary buffers chunked to prevent Bluetooth buffer overflow
async function writeToPrinter(dataArray) {
    const chunkLimit = 128; // Web Bluetooth characteristic write limit is normally 512, 128 is highly safe
    const char = state.bluetooth.characteristic;
    
    for (let i = 0; i < dataArray.length; i += chunkLimit) {
        const chunk = dataArray.slice(i, i + chunkLimit);
        
        // Wait for characteristic write promise resolution
        await char.writeValue(chunk);
        
        // Small delay to allow printer micro-buffer execution
        await new Promise(resolve => setTimeout(resolve, 15));
    }
}

// ==========================================================================
// APP INITIALIZATION
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Database initial setup
    DB.init();
    
    // 2. Navigation bar initial settings
    Navigation.init();
    
    // 3. Setup form input handlers
    initFormHandlers();
    
    // 4. Modal prints and handlers
    initModalHandlers();
    
    // 5. Bluetooth printer controls
    initBluetooth();
    
    // 6. Shop settings panel syncs
    initSettingsForm();
    
    // 7. Load dashboard statistics
    updateDashboardStats();
    populateRecordsTable();
    populateRecentPawnsTable();
    populateRecentRedemptionsTable();
    
    // 8. Start clocks ticking
    startLiveClocks();
    
    // 9. Reset form defaults on startup
    resetNewPawnForm();

    // 10. Start system password lock screen
    initLockScreen();
    
    // Sync shop name labels on sidebar
    document.getElementById('sidebar-shop-name').textContent = state.settings.shopName;
    document.getElementById('topbar-shop-name').textContent = state.settings.shopName;

    // 11. Register Service Worker for PWA installability
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully:', reg.scope))
            .catch(err => console.error('Service Worker registration failed:', err));
    }
});
