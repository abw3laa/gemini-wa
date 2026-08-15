# Phase 12: صورة Docker لـ whatsapp-service

FROM node:24-slim

WORKDIR /app

# نثبّت المكتبات أولًا لوحدها حتى Docker يستفيد من الـ cache
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# مجلدات الجلسة وقاعدة المعرفة - تُنشأ هون افتراضيًا، لكن بالإنتاج لازم
# تُربط بـ persistent disk حقيقي (راجع DEPLOYMENT.md) وإلا تُفقد الجلسة
# وقاعدة المعرفة عند كل إعادة نشر (redeploy)
RUN mkdir -p auth_info_baileys data

CMD ["node", "src/index.js"]
