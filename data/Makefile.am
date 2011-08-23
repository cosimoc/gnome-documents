desktopdir = $(datadir)/applications
desktop_DATA = $(desktop_in_files:.desktop.in=.desktop)
desktop_in_files = gnome-documents.desktop.in

@INTLTOOL_DESKTOP_RULE@

servicedir = $(datadir)/dbus-1/services
service_DATA = $(service_in_files:.service.in=.service)
$(service_DATA): $(service_in_files) Makefile
	$(AM_V_GEN)	\
		[ -d $(@D) ] || $(mkdir_p) $(@D) ; \
		sed -e "s|\@libexecdir\@|$(libexecdir)|" $< > $@.tmp && mv $@.tmp $@

service_in_files = org.gnome.Documents.GDataMiner.service.in

gsettingsschema_in_files = org.gnome.documents.gschema.xml.in
gsettings_SCHEMAS = $(gsettingsschema_in_files:.xml.in=.xml)
.PRECIOUS: $(gsettings_SCHEMAS)

@INTLTOOL_XML_NOMERGE_RULE@
@GSETTINGS_RULES@

styledir = $(pkgdatadir)/style

dist_style_DATA = \
    gtk-style.css

EXTRA_DIST= \
    gnome-documents.desktop \
    $(service_in_files) \
    $(desktop_in_files) \
    $(gsettingsschema_in_files)

CLEANFILES = \
    $(desktop_DATA) \
    $(gsettings_SCHEMAS) \
    $(service_DATA)
