<template>
  <div class="page-shell">
    <div class="section contacts">
      <h1>Контакты</h1>
      <p class="contacts-lead">
        Мы всегда рады гостям — заходите на обед или закажите заранее через сайт!
      </p>

      <div class="contacts-grid">
        <div class="contact-card">
          <h3>📍 Адрес</h3>
          <p>Корпус №1, 1 этаж<br />Студенческое кафе «СтудFood»</p>
        </div>

        <div class="contact-card">
          <h3>🕗 Часы работы</h3>
          <p>Пн–Пт: 8:00–17:00<br />Сб–Вс: выходной</p>
        </div>

        <div class="contact-card">
          <h3>📞 Телефон</h3>
          <p>
            <a class="text-link" href="tel:+79001234567">+7 (900) 123-45-67</a>
          </p>
        </div>

        <div class="contact-card">
          <h3>💬 Мы ВКонтакте</h3>
          <p>Сообщество «СтудFood Заказы»</p>
          <a
            class="button button--primary"
            href="https://vk.com/club239108717"
            target="_blank"
            rel="noreferrer"
          >
            Открыть сообщество
          </a>
        </div>
      </div>

      <div class="bot-banner">
        <div class="bot-banner__text">
          <h2>Уведомления о заказах в VK</h2>
          <p>
            Напишите нашему боту одно сообщение — и мы будем присылать вам статус
            заказа (принят, готовится, готов к выдаче) прямо в личные сообщения ВКонтакте.
          </p>
        </div>
        <a
          class="button button--primary bot-banner__btn"
          href="https://vk.me/club239108717"
          target="_blank"
          rel="noreferrer"
        >
          Написать боту
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contacts-lead {
  color: var(--color-text-secondary, #718096);
  margin-bottom: 2rem;
}

.contacts-grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  margin-bottom: 2.5rem;
}

.contact-card {
  background: var(--color-card, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 14px;
  padding: 1.5rem;
}

.contact-card h3 {
  margin-bottom: 0.5rem;
  font-size: 1.05rem;
}

.contact-card p {
  color: var(--color-text-secondary, #718096);
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
}

.bot-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  background: var(--color-bg-secondary, #f8f6f4);
  border-radius: 16px;
  padding: 1.75rem;
}

.bot-banner__text h2 {
  margin-bottom: 0.4rem;
  font-size: 1.2rem;
}

.bot-banner__text p {
  color: var(--color-text-secondary, #718096);
  max-width: 560px;
}

.bot-banner__btn {
  white-space: nowrap;
}
</style>
