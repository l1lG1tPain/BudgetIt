// State management
let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let companyName = localStorage.getItem('companyName') || '';

// Welcome Screen Logic
if (!companyName) {
  openModal('welcome-screen');
  document.getElementById('welcome-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const inputName = document.getElementById('company-name').value.trim().toUpperCase();
    if (inputName) {
      companyName = inputName;
      localStorage.setItem('companyName', companyName);
      document.getElementById('company-header').textContent = companyName;
      closeModal('welcome-screen');
    } else {
      alert('Введите название компании!');
    }
  });
} else {
  document.getElementById('company-header').textContent = companyName;
}

// Format number to 10.000.000 style
function formatNumber(num) {
  return num.toLocaleString('ru-RU');
}

// Format date to dd.mm.yy
function formatDate(date) {
  const options = { year: '2-digit', month: '2-digit', day: '2-digit' };
  return new Date(date).toLocaleDateString('ru-RU', options);
}

// Map status to color and name
function getStatusInfo(status) {
  const statusMap = {
    debt: { color: 'red', name: 'Долг' },
    paid: { color: 'green', name: 'Оплачено' },
    expense: { color: 'orange', name: 'Расход' },
  };
  return statusMap[status] || { color: 'black', name: 'Неизвестно' };
}

// Open/Close Modal Functions
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('hidden');
  modal.classList.add('visible');
  document.body.classList.add('modal-open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.add('hidden');
  modal.classList.remove('visible');
  document.body.classList.remove('modal-open');
}

// Update UI
function updateUI() {
  const income = transactions.filter(t => t.status === 'paid').reduce((acc, t) => acc + t.amount, 0);
  const expense = transactions.filter(t => t.status === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const pending = transactions.filter(t => t.status === 'debt').reduce((acc, t) => acc + t.amount, 0);

  document.getElementById('income-amount').innerText = formatNumber(income);
  document.getElementById('expense-amount').innerText = formatNumber(expense);
  document.getElementById('pending-amount').innerText = formatNumber(pending);

  const selectedMonth = document.getElementById('month-filter')?.value || 'all';
  filterTransactionsByMonth(selectedMonth);
}

// Filter Transactions by Month
function filterTransactionsByMonth(month) {
    const filteredTransactions =
      month === 'all'
        ? transactions
        : transactions.filter((t) => new Date(t.date).toISOString().slice(5, 7) === month);
  
    // Обновляем список транзакций
    updateFilteredUI(filteredTransactions);
  
    // Пересчитываем доход, расход и долг
    const income = filteredTransactions.filter(t => t.status === 'paid').reduce((acc, t) => acc + t.amount, 0);
    const expense = filteredTransactions.filter(t => t.status === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const pending = filteredTransactions.filter(t => t.status === 'debt').reduce((acc, t) => acc + t.amount, 0);
  
    // Обновляем отображение дохода, расхода и долга
    document.getElementById('income-amount').innerText = formatNumber(income);
    document.getElementById('expense-amount').innerText = formatNumber(expense);
    document.getElementById('pending-amount').innerText = formatNumber(pending);
  }
  

// Update Filtered UI
function updateFilteredUI(filteredTransactions) {
  const list = document.getElementById('transaction-list');
  list.innerHTML = '';

  filteredTransactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((t, index) => {
      const { color, name: statusName } = getStatusInfo(t.status);
      const li = document.createElement('li');
      li.dataset.index = index;
      li.style.borderLeft = `4px solid ${color}`;
      li.innerHTML = `
        <div>
          <b>${t.name}</b>
          <span style="color: ${color}; font-weight: bold;">${statusName}</span>
          <span style="float: right;">${formatNumber(t.amount)}</span>
        </div>
        <div style="font-size: 0.9em; color: gray; text-align: right;">${formatDate(t.date)}</div>
      `;
      list.appendChild(li);
    });

  // Add delete event listeners
  document.querySelectorAll('.delete-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const index = e.target.getAttribute('data-index');
      transactions.splice(index, 1);
      localStorage.setItem('transactions', JSON.stringify(transactions));
      updateUI();
    });
  });
}

// Logic for tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
  });
});

// Add Transaction (Debt or Paid)
document.getElementById('debt-paid-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const date = document.getElementById('date').value || new Date().toISOString().split('T')[0];
  const name = document.getElementById('name').value.trim() || 'N/A';
  const phone = document.getElementById('phone').value || '';
  const amount = +document.getElementById('amount').value;
  const status = document.getElementById('status').value;

  if (!amount) {
    alert('Введите сумму!');
    return;
  }

  transactions.push({ date, name, phone, amount, status });
  localStorage.setItem('transactions', JSON.stringify(transactions));

  e.target.reset();
  updateUI();

  closeModal('bottom-sheet');
});

// Add Transaction (Expense)
document.getElementById('expense-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const date = document.getElementById('expense-date').value || new Date().toISOString().split('T')[0];
  const products = Array.from(document.querySelectorAll('#products-list .product-item'));
  let totalAmount = 0;

  products.forEach(product => {
    const name = product.querySelector('.product-name').value.trim() || 'Товар';
    const quantity = +product.querySelector('.product-quantity').value || 1;
    const price = +product.querySelector('.product-price').value || 0;
    totalAmount += quantity * price;
  });

  if (!totalAmount) {
    alert('Добавьте хотя бы один товар с ценой!');
    return;
  }

  transactions.push({ date, name: 'Расходы', phone: '', amount: totalAmount, status: 'expense' });
  localStorage.setItem('transactions', JSON.stringify(transactions));

  document.getElementById('products-list').innerHTML = `
    <div class="product-item">
      <label>Товар:</label>
      <input type="text" class="product-name" placeholder="Название">
      <input type="number" class="product-quantity" placeholder="Кол-во" required>
      <input type="number" class="product-price" placeholder="Цена" required>
    </div>
  `;
  updateUI();

  closeModal('bottom-sheet');
});

// Add new product input
document.getElementById('add-product').addEventListener('click', () => {
  const productList = document.getElementById('products-list');
  const newProduct = document.createElement('div');
  newProduct.classList.add('product-item');
  newProduct.innerHTML = `
    <label>Товар:</label>
    <input type="text" class="product-name" placeholder="Название">
    <input type="number" class="product-quantity" placeholder="Кол-во" required>
    <input type="number" class="product-price" placeholder="Цена" required>
  `;
  productList.appendChild(newProduct);
});

// Open/Close Bottom Sheet
document.getElementById('add-btn').addEventListener('click', () => {
    document.getElementById('bottom-sheet').classList.remove('hidden');
  
    // Устанавливаем текущую дату по умолчанию
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today; // Для формы Долг/Оплата
    document.getElementById('expense-date').value = today; // Для формы Расход
  });
  
  document.getElementById('close-btn').addEventListener('click', () => {
    document.getElementById('bottom-sheet').classList.add('hidden');
  });

// Открытие настроек
document.getElementById('settings-btn').addEventListener('click', () => {
    openModal('settings-page');
  });
  
  // Закрытие настроек
  document.getElementById('close-settings').addEventListener('click', () => {
    closeModal('settings-page');
  });
  
  
// Export/Import Data
document.getElementById('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(transactions)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transactions.json';
  a.click();
});

// Обработка импорта данных
document.getElementById('import-file').addEventListener('change', (event) => {
    const file = event.target.files[0]; // Получаем файл
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          // Парсим данные из файла
          const importedData = JSON.parse(reader.result);
          if (Array.isArray(importedData)) {
            transactions = importedData; // Обновляем транзакции
            localStorage.setItem('transactions', JSON.stringify(transactions)); // Сохраняем в localStorage
            updateUI(); // Обновляем интерфейс
            alert('Данные успешно импортированы!');
          } else {
            alert('Формат файла некорректен!');
          }
        } catch (error) {
          alert('Ошибка при чтении файла!');
        }
      };
      reader.readAsText(file); // Считываем файл
    }
  });
  

// Month Filter
document.getElementById('month-filter').addEventListener('change', (e) => {
  filterTransactionsByMonth(e.target.value);
});

// Открытие bottom-sheet с информацией
document.getElementById('transaction-list').addEventListener('click', (e) => {
    const target = e.target.closest('li');
    if (!target) return;
  
    const index = target.dataset.index;
    const transaction = transactions[index];
  
    // Устанавливаем данные
    document.getElementById('info-name').innerText = transaction.name;
    document.getElementById('info-status').innerText = transaction.status === 'debt' ? 'Долг' : transaction.status === 'paid' ? 'Оплачено' : 'Расход';
    document.getElementById('info-phone').innerText = transaction.phone || 'Не указан';
    document.getElementById('info-amount').innerText = transaction.amount.toLocaleString('ru-RU');
    document.getElementById('info-date').innerText = formatDate(transaction.date);
  
    // Показываем кнопки в зависимости от статуса
    if (transaction.status === 'debt') {
      document.getElementById('debt-buttons').classList.remove('hidden');
      document.getElementById('delete-only-btn').classList.add('hidden');
    } else {
      document.getElementById('debt-buttons').classList.add('hidden');
      document.getElementById('delete-only-btn').classList.remove('hidden');
    }
  
    // Сохраняем индекс транзакции
    document.getElementById('bottom-sheet-info').dataset.index = index;
  
    // Открываем bottom-sheet
    document.getElementById('bottom-sheet-info').classList.remove('hidden');
  });
  
// Оплата долга
document.getElementById('paid-btn').addEventListener('click', () => {
    const index = document.getElementById('bottom-sheet-info').dataset.index;
    transactions[index].status = 'paid'; // Меняем статус на "Оплачено"
    localStorage.setItem('transactions', JSON.stringify(transactions));
    updateUI();
    closeModal('bottom-sheet-info');
  });
  
  // Удаление транзакции
  document.querySelectorAll('#delete-btn, #delete-only-btn').forEach(button => {
    button.addEventListener('click', () => {
      const index = document.getElementById('bottom-sheet-info').dataset.index;
      transactions.splice(index, 1); // Удаляем транзакцию
      localStorage.setItem('transactions', JSON.stringify(transactions));
      updateUI();
      closeModal('bottom-sheet-info');
    });
  });
  
  // Закрытие bottom-sheet
  document.getElementById('close-info-btn').addEventListener('click', () => {
    closeModal('bottom-sheet-info');
  });
  

  let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Показать кнопку "Установить"
  const installButton = document.getElementById('install-btn');
  if (installButton) {
    installButton.style.display = 'block';

    installButton.addEventListener('click', () => {
      installButton.style.display = 'none';
      deferredPrompt.prompt();

      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the A2HS prompt');
        } else {
          console.log('User dismissed the A2HS prompt');
        }
        deferredPrompt = null;
      });
    });
  }
});

  

// Initialize
updateUI();
