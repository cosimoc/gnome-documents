/*
 * Copyright (c) 2011 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

const Clutter = imports.gi.Clutter;
const EvView = imports.gi.EvinceView;
const Gd = imports.gi.Gd;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Global = imports.global;
const Tweener = imports.util.tweener;
const MainToolbar = imports.mainToolbar;
const Searchbar = imports.searchbar;
const View = imports.view;

const _FULLSCREEN_TOOLBAR_TIMEOUT = 2; // seconds

const PreviewView = new Lang.Class({
    Name: 'PreviewView',

    _init: function() {
        this._model = null;
        this._jobFind = null;

        this.widget = new Gtk.ScrolledWindow({ hexpand: true,
                                               vexpand: true,
                                               shadow_type: Gtk.ShadowType.IN });
        this.widget.get_style_context().add_class('documents-scrolledwin');

        this._createView();
        this.widget.show_all();

        this._zoomIn = Global.application.lookup_action('zoom-in');
        this._zoomIn.connect('activate', Lang.bind(this,
            function() {
                this._model.set_sizing_mode(EvView.SizingMode.FREE);
                this.view.zoom_in();
            }));

        this._zoomOut = Global.application.lookup_action('zoom-out');
        this._zoomOut.connect('activate', Lang.bind(this,
            function() {
                this._model.set_sizing_mode(EvView.SizingMode.FREE);
                this.view.zoom_out();
            }));

        this._findPrev = Global.application.lookup_action('find-prev');
        this._findPrev.connect('activate', Lang.bind(this,
            function() {
                this.view.find_previous();
            }));
        this._findNext = Global.application.lookup_action('find-next');
        this._findNext.connect('activate', Lang.bind(this,
            function() {
                this.view.find_next();
            }));

        let rotLeft = Global.application.lookup_action('rotate-left');
        rotLeft.connect('activate', Lang.bind(this,
            function() {
                this._changeRotation(-90);
            }));
        let rotRight = Global.application.lookup_action('rotate-right');
        rotRight.connect('activate', Lang.bind(this,
            function() {
                this._changeRotation(90);
            }));
    },

    _createView: function() {
        this.view = EvView.View.new();
        this.widget.add(this.view);
        this.view.show();

        this.view.connect('button-press-event',
                            Lang.bind(this, this._onButtonPressEvent));
        this.view.connect('key-press-event',
                            Lang.bind(this, this._onKeyPressEvent));
    },

    _onKeyPressEvent: function(widget, event) {
        let keyval = event.get_keyval()[1];
        let state = event.get_state()[1];

        if ((keyval == Gdk.KEY_Page_Up) &&
            ((state & Gdk.ModifierType.CONTROL_MASK) != 0)) {
            this.view.previous_page();
            return true;
        }

        if ((keyval == Gdk.KEY_Page_Down) &&
            ((state & Gdk.ModifierType.CONTROL_MASK) != 0)) {
            this.view.next_page();
            return true;
        }

        if (keyval == Gdk.KEY_Page_Up) {
            this.view.scroll(Gtk.ScrollType.PAGE_BACKWARD, false);
            return true;
        }

        if (keyval == Gdk.KEY_space ||
            keyval == Gdk.KEY_Page_Down) {
            this.view.scroll(Gtk.ScrollType.PAGE_FORWARD, false);
            return true;
        }

        return false;
     },

    _onButtonPressEvent: function(widget, event) {
        let button = event.get_button()[1];
        let clickCount = event.get_click_count()[1];

        if (button == 1 && clickCount == 2) {
            Global.modeController.toggleFullscreen();
            return true;
        }

        return false;
    },

    _changeRotation: function(offset) {
        let rotation = this._model.get_rotation();
        this._model.set_rotation(rotation + offset);
    },

    startSearch: function(str) {
        if (!this._model)
            return;

        if (this._jobFind) {
            if (!this._jobFind.is_finished())
                this._jobFind.cancel();
            this._jobFind = null;
        }

        if (!str) {
            this.view.queue_draw();
            return;
        }

        let evDoc = this._model.get_document();
        this._jobFind = EvView.JobFind.new(evDoc, this._model.get_page(), evDoc.get_n_pages(),
                                           str, false);
        this._jobFind.connect('updated', Lang.bind(this, this._onSearchJobUpdated));

        this._jobFind.scheduler_push_job(EvView.JobPriority.PRIORITY_NONE);
    },

    _onSearchJobUpdated: function(job, page) {
        // FIXME: ev_job_find_get_results() returns a GList **
        // and thus is not introspectable
        Gd.ev_view_find_changed(this.view, job, page);
    },

    setModel: function(model) {
        if (this._model == model)
            return;

        if (this.view)
            this.view.destroy();

        this._model = model;

        if (this._model) {
            this._createView();
            this.view.set_model(this._model);
        }
    },

    getModel: function() {
        return this._model;
    }
});

const PreviewThumbnails = new Lang.Class({
    Name: 'PreviewThumbnails',

    _init: function(model) {
        this.view = new Gd.SidebarThumbnails({ model: model });
        this.widget = new Gd.ThumbNav({ thumbview: this.view });
        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            opacity: 0 });

        this.widget.show_all();
    },

    show: function() {
        this.actor.show();

        Tweener.addTween(this.actor,
            { opacity: 255,
              time: 0.30,
              transition: 'easeOutQuad' });
    },

    hide: function() {
        Tweener.addTween(this.actor,
            { opacity: 0,
              time: 0.30,
              transition: 'easeOutQuad',
              onComplete: function() {
                  this.actor.hide();
              },
              onCompleteScope: this });
    }
});

const PreviewFullscreen = new Lang.Class({
    Name: 'PreviewFullscreen',

    _init: function(previewView, layout, parentActor) {
        this._motionTimeoutId = 0;

        let model = previewView.getModel();

        this._filter = new Gd.FullscreenFilter();
        this._filter.connect('motion-event', Lang.bind(this, this._fullscreenMotionHandler));
        this._filter.start();

        // create thumb bar
        this._thumbBar = new PreviewThumbnails(model);

        layout.add(this._thumbBar.actor,
            Clutter.BinAlignment.FIXED, Clutter.BinAlignment.FIXED);

        let widthConstraint =
            new Clutter.BindConstraint({ source: parentActor,
                                         coordinate: Clutter.BindCoordinate.WIDTH,
                                         offset: - 300 });
        this._thumbBar.actor.add_constraint(widthConstraint);
        this._thumbBar.actor.connect('notify::width', Lang.bind(this,
            function() {
                let width = parentActor.width;
                let offset = 300;

                if (width > 1000)
                    offset += (width - 1000);
                else if (width < 600)
                    offset -= (600 - width);

                widthConstraint.offset = - offset;
            }));

        this._thumbBar.actor.add_constraint(
            new Clutter.AlignConstraint({ align_axis: Clutter.AlignAxis.X_AXIS,
                                          source: parentActor,
                                          factor: 0.50 }));
        this._thumbBar.actor.add_constraint(
            new Clutter.AlignConstraint({ align_axis: Clutter.AlignAxis.Y_AXIS,
                                          source: parentActor,
                                          factor: 0.95 }));

        // create toolbar
        this._fsToolbar = new PreviewFullscreenToolbar(previewView);
        this._fsToolbar.setModel(model);

        layout.add(this._fsToolbar.actor,
            Clutter.BinAlignment.FIXED, Clutter.BinAlignment.FIXED);

        let vScrollbar = previewView.widget.get_vscrollbar();

        let sizeConstraint = new Clutter.BindConstraint
            ({ coordinate: Clutter.BindCoordinate.WIDTH,
               source: parentActor,
               offset: (vScrollbar.get_visible() ?
                        (- (vScrollbar.get_preferred_width()[1])) : 0 ) });

        // update the constraint size when the scrollbar changes visibility
        vScrollbar.connect('notify::visible',
            function() {
                sizeConstraint.offset = (vScrollbar.get_visible() ?
                                         (- (vScrollbar.get_preferred_width()[1])) : 0 );
            });

        this._fsToolbar.actor.add_constraint(sizeConstraint);
    },

    destroy: function() {
        if (this._motionTimeoutId != 0) {
            Mainloop.source_remove(this._motionTimeoutId);
            this._motionTimeoutId = 0;
        }

        this._filter.stop();

        this._thumbBar.actor.destroy();
        this._fsToolbar.widget.destroy();
    },

    _show: function() {
        this._fsToolbar.show();
        this._thumbBar.show();
    },

    _hide: function() {
        this._fsToolbar.hide();
        this._thumbBar.hide();
    },

    _fullscreenMotionHandler: function() {
        if (!Global.modeController.getFullscreen())
            return;

        // if we were idle fade in the toolbar, otherwise reset
        // the timeout
        if (this._motionTimeoutId == 0) {
            this._show();
        } else {
            Mainloop.source_remove(this._motionTimeoutId);
        }

        this._motionTimeoutId = Mainloop.timeout_add_seconds
            (_FULLSCREEN_TOOLBAR_TIMEOUT, Lang.bind(this,
                function() {
                    this._motionTimeoutId = 0;
                    this._hide();

                    return false;
            }));
    }
});

const PreviewToolbar = new Lang.Class({
    Name: 'PreviewToolbar',
    Extends: MainToolbar.MainToolbar,

    _init: function(previewView) {
        this._previewView = previewView;

        this.parent();

        // back button, on the left of the toolbar
        let iconName =
            (this.widget.get_direction() == Gtk.TextDirection.RTL) ?
            'go-next-symbolic' : 'go-previous-symbolic';
        let backButton =
            this.widget.add_button(iconName, _("Back"), true);
        backButton.connect('clicked', Lang.bind(this,
            function() {
                Global.documentManager.setActiveItem(null);
            }));

        // search button, on the right of the toolbar
        this.addSearchButton();

        // menu button, on the right of the toolbar
        let previewMenu = this._getPreviewMenu();
        let menuButton = this.widget.add_menu('emblem-system-symbolic', null, false);
        menuButton.set_menu_model(previewMenu);

        this._setToolbarTitle();
        this.widget.show_all();
    },

    _getPreviewMenu: function() {
        let builder = new Gtk.Builder();
        builder.add_from_resource('/org/gnome/documents/preview-menu.ui');
        let menu = builder.get_object('preview-menu');

        let doc = Global.documentManager.getActiveItem();
        if (doc && doc.defaultAppName) {
            let section = builder.get_object('open-section');
            section.remove(0);
            section.prepend(_("Open with %s").format(doc.defaultAppName), 'app.open-current');
        }

        return menu;
    },

    createSearchbar: function() {
        this._searchbar = new PreviewSearchbar(this._previewView);
        this.layout.pack_start = false;
        this.layout.pack(this._searchbar.actor, false, true, false,
                         Clutter.BoxAlignment.CENTER, Clutter.BoxAlignment.START);
    },

    _setToolbarTitle: function() {
        let doc = Global.documentManager.getActiveItem();
        let primary = doc.name;
        let detail = null;

        if (this._model) {
            let curPage, totPages;

            curPage = this._model.get_page();
            totPages = this._model.get_document().get_n_pages();

            detail = _("%d of %d").format(curPage + 1, totPages);
        }

        if (detail)
            detail = '(' + detail + ')';

        this.widget.set_labels(primary, detail);
    },

    setModel: function(model) {
        if (!model)
            return;

        this._model = model;
        this._model.connect('page-changed', Lang.bind(this,
            function() {
                this._setToolbarTitle();
            }));

        this._setToolbarTitle();
    }
});

const PreviewSearchbar = new Lang.Class({
    Name: 'PreviewSearchbar',
    Extends: Searchbar.Searchbar,

    _init: function(previewView) {
        this.parent();

        this._previewView = previewView;
    },

    createSearchWidgets: function() {
        this._searchContainer = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
                                              spacing: 6 });

        this._searchEntry = new Gtk.SearchEntry({ hexpand: true });
        this._searchEntry.connect('activate', Lang.bind(this,
            function() {
                Global.application.activate_action('find-next', null);
            }));
        this._searchContainer.add(this._searchEntry);

        let controlsBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        controlsBox.get_style_context().add_class('linked');
        controlsBox.get_style_context().add_class('raised');
        this._searchContainer.add(controlsBox);

        let prev = new Gtk.Button({ action_name: 'app.find-prev' });
        prev.set_image(new Gtk.Image({ icon_name: 'go-up-symbolic',
                                       icon_size: Gtk.IconSize.MENU,
                                       margin: 2 }));
        prev.set_tooltip_text(_("Find Previous"));
        controlsBox.add(prev);

        let next = new Gtk.Button({ action_name: 'app.find-next' });
        next.set_image(new Gtk.Image({ icon_name: 'go-down-symbolic',
                                       icon_size: Gtk.IconSize.MENU,
                                       margin: 2 }));
        next.set_tooltip_text(_("Find Next"));
        controlsBox.add(next);
    },

    entryChanged: function() {
        this._previewView.view.find_search_changed();
        this._previewView.startSearch(this._searchEntry.get_text());
    },

    show: function() {
        this.parent();

        this._previewView.view.find_set_highlight_search(true);
        this._previewView.startSearch(this._searchEntry.get_text());
    },

    hide: function() {
        this.parent();

        this._previewView.view.find_set_highlight_search(false);
    }
});

const PreviewFullscreenToolbar = new Lang.Class({
    Name: 'PreviewFullscreenToolbar',
    Extends: PreviewToolbar,

    _init: function(previewView) {
        this.parent(previewView);

        this.actor.y = -(this.widget.get_preferred_height()[1]);
    },

    show: function() {
        Tweener.addTween(this.actor,
                         { y: 0,
                           time: 0.20,
                           transition: 'easeInQuad' });
    },

    hide: function() {
        Tweener.addTween(this.actor,
                         { y: -(this.widget.get_preferred_height()[1]),
                           time: 0.20,
                           transition: 'easeOutQuad' });
    }
});
