FROM httpd:2.4

COPY apache/httpd.conf /usr/local/apache2/conf/httpd.conf
COPY apache/entrypoint.sh /entrypoint.sh
COPY web/ /usr/local/apache2/htdocs/

RUN chmod 0755 /entrypoint.sh \
 && chmod -R a+rX /usr/local/apache2/htdocs

# Draait volledig als www-data; poorten 8080/8443 worden door Docker op 80/443 gezet.
USER www-data
EXPOSE 8080 8443
ENTRYPOINT ["/entrypoint.sh"]
