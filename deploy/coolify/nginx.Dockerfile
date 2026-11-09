# The site's nginx for Coolify: corpus photos from the `corpus` volume, the
# rest proxied to the app, with the sign-in limit (deploy/coolify/nginx.conf).
FROM nginx:1.27-alpine
COPY deploy/coolify/nginx.conf /etc/nginx/conf.d/default.conf
